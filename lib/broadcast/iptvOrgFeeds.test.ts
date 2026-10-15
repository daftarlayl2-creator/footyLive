import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLiveChannels, channelIdFor, DEFAULT_LIVE_FEEDS, FEED_CACHE_TTL_S, fetchFeedText, getFeedUrls, getLiveChannels, githubContentsApiUrl, parseFeedText, resetChannelMemoryCache } from './feeds';
import { parseM3U } from './m3u';
import { canonicalFeedUrl, isIptvOrgFeed, IPTV_ORG_SPORTS_API, IPTV_ORG_SPORTS_URL } from './sources';

const cacheKeys = vi.hoisted(() => [] as string[]);
vi.mock('../cache/cacheManager', () => ({ getCacheManager: () => ({
  swr: (key: string, load: () => unknown) => { cacheKeys.push(key); return load(); },
}) }));
vi.mock('../logger', () => ({ default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// Representative published metadata, with playback URLs sanitized for offline tests.
const playlist = '#EXTM3U\r\n#EXTINF:-1 tvg-id="5Plus.il@SD" tvg-logo="https://images.example.com/logo@2x.png?width=1024&v=2" group-title="Kids;Sports",5Plus (1080p)\r\nhttps://cdn.example.com/live/5plus/index.m3u8\r\n';
const apiResponse = (text = playlist) => new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from(text).toString('base64') }));

beforeEach(() => { resetChannelMemoryCache(); cacheKeys.length = 0; vi.stubEnv('HLS_PROXY_ALLOW_PRIVATE_HOSTS', 'false'); vi.stubEnv('LIVE_FEED_URLS', undefined); });
afterEach(() => { resetChannelMemoryCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('official IPTV-Org source', () => {
  it('enables the exact official URL by default, preserving custom/disabled configurations', () => {
    expect(DEFAULT_LIVE_FEEDS).toContain(IPTV_ORG_SPORTS_URL);
    expect(getFeedUrls()).toContain(IPTV_ORG_SPORTS_URL);
    expect(getFeedUrls('')).toEqual([]);
    expect(getFeedUrls('https://custom.example.com/list.m3u')).toEqual(['https://custom.example.com/list.m3u']);
    expect(getFeedUrls(`${IPTV_ORG_SPORTS_URL},${IPTV_ORG_SPORTS_API},${IPTV_ORG_SPORTS_URL}`)).toEqual([IPTV_ORG_SPORTS_URL]);
  });

  it('maps only the published gh-pages sports file, never another category or branch', () => {
    for (const transport of [IPTV_ORG_SPORTS_URL, IPTV_ORG_SPORTS_API, 'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/categories/sports.m3u', 'https://github.com/iptv-org/iptv/blob/gh-pages/categories/sports.m3u']) {
      expect(canonicalFeedUrl(transport)).toBe(IPTV_ORG_SPORTS_URL);
      expect(githubContentsApiUrl(transport)).toBe(IPTV_ORG_SPORTS_API);
      expect(isIptvOrgFeed(transport)).toBe(true);
    }
    expect(isIptvOrgFeed('https://raw.githubusercontent.com/iptv-org/iptv/master/categories/sports.m3u')).toBe(false);
    expect(isIptvOrgFeed('https://iptv-org.github.io/iptv/categories/news.m3u')).toBe(false);
    expect(isIptvOrgFeed('https://iptv-org.github.io.attacker.example/iptv/categories/sports.m3u')).toBe(false);
    expect(isIptvOrgFeed('https://user:password@iptv-org.github.io/iptv/categories/sports.m3u')).toBe(false);
  });

  it.each(['blocked', 'html', 'media'])('uses the same official gh-pages data when the Pages response is %s', async (failure) => {
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      if (failure === 'blocked') throw new TypeError('fetch failed');
      return new Response(failure === 'html' ? '<html>blocked</html>' : '#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment.ts');
    }).mockImplementationOnce(async () => apiResponse());
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchFeedText(IPTV_ORG_SPORTS_URL)).toBe(playlist);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([IPTV_ORG_SPORTS_URL, IPTV_ORG_SPORTS_API]);
  });

  it('decodes a directly configured Contents transport and preserves canonical identity', async () => {
    const fetcher = vi.fn(async () => apiResponse()); vi.stubGlobal('fetch', fetcher);
    const entries = parseFeedText(await fetchFeedText(IPTV_ORG_SPORTS_API), IPTV_ORG_SPORTS_API);
    const original = parseFeedText(playlist, IPTV_ORG_SPORTS_URL)[0];
    expect(entries[0].feedUrl).toBe(IPTV_ORG_SPORTS_URL);
    expect(channelIdFor(entries[0])).toBe(channelIdFor(original));
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('bounds chunked feed reads and cancels an oversized body before falling back', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(body)).mockImplementationOnce(async () => apiResponse()));
    expect(await fetchFeedText(IPTV_ORG_SPORTS_URL)).toBe(playlist);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps extensionless official candidates but rejects private/non-HTTP stream URLs', () => {
    const channels = buildLiveChannels(parseM3U('#EXTM3U\n#EXTINF:-1,Extensionless Sports\nhttps://cdn.example.com/play/token\n#EXTINF:-1,Private\nhttp://127.0.0.1/local.m3u8\n#EXTINF:-1,Unsafe\njavascript:alert(1)', IPTV_ORG_SPORTS_URL));
    expect(channels.map((channel) => channel.name)).toEqual(['Extensionless Sports']);
  });

  it('coalesces simultaneous cold feed loads even without cache-manager deduplication', async () => {
    const fetcher = vi.fn(async () => new Response(playlist)); vi.stubGlobal('fetch', fetcher);
    const [one, two] = await Promise.all([getLiveChannels(), getLiveChannels()]);
    expect(one).toEqual(two);
    expect(fetcher).toHaveBeenCalledTimes(DEFAULT_LIVE_FEEDS.length);
  });

  it('preserves a failed source on partial refresh and invalidates caches when configuration changes', async () => {
    let now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const legacy = 'https://custom.example.com/events.m3u';
    vi.stubEnv('LIVE_FEED_URLS', `${legacy},${IPTV_ORG_SPORTS_URL}`);
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(String(url) === legacy ? playlist.replaceAll('5Plus', 'Legacy').replaceAll('/5plus/', '/legacy/') : playlist));
    vi.stubGlobal('fetch', fetcher);
    expect((await getLiveChannels()).map((channel) => channel.name)).toEqual(['Legacy (1080p)', '5Plus (1080p)']);
    now += (FEED_CACHE_TTL_S + 1) * 1000;
    fetcher.mockImplementation(async (url) => String(url) === legacy ? new Response(playlist.replaceAll('5Plus', 'New Legacy').replaceAll('/5plus/', '/new/')) : new Response('down', { status: 503 }));
    expect((await getLiveChannels()).map((channel) => channel.name)).toEqual(['New Legacy (1080p)', '5Plus (1080p)']);
    const firstKey = cacheKeys[0];
    vi.stubEnv('LIVE_FEED_URLS', legacy);
    expect((await getLiveChannels()).map((channel) => channel.name)).toEqual(['New Legacy (1080p)']);
    expect(cacheKeys.at(-1)).not.toBe(firstKey);
    vi.stubEnv('LIVE_FEED_URLS', '');
    expect(await getLiveChannels()).toEqual([]);
  });
});

describe('extended sports M3U metadata', () => {
  it('retains full-resolution logos, multi-group tags and actual title resolution over @SD database suffixes', () => {
    const [channel] = parseM3U(`\uFEFF${playlist}`, IPTV_ORG_SPORTS_URL);
    expect(channel).toMatchObject({ name: '5Plus (1080p)', quality: 'FHD', group: 'Kids;Sports', tags: ['Kids', 'Sports'], logo: 'https://images.example.com/logo@2x.png?width=1024&v=2', source: 'iptv-org.github.io' });
  });

  it('does not promote a low-resolution title just because its database id advertises HD', () => {
    const [channel] = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-id=ESPN2.nl@HD,ESPN 2 (Netherlands) HD (360p)\nhttps://cdn.example.com/espn2/index.m3u8', IPTV_ORG_SPORTS_URL);
    expect(channel.quality).toBe('SD');
  });

  it('handles single/unquoted attributes, quoted commas and EXTGRP without leaking headers', () => {
    const text = [
      '#EXTM3U', '#EXTINF:-1 tvg-name=ESPN2 tvg-logo=javascript:bad,Orphan',
      '#EXTVLCOPT:http-referrer=https://orphan.example.com/',
      '#EXTINF:-1 TVG-ID=ESPN2.us@HD tvg-name=ESPN2 tvg-logo=\'https://images.example.com/a,b.svg?width=2048\',ESPN 2 (720p)',
      '#EXTGRP:News;Sports', '#EXTHTTP:{"Referrer":"https://embed.example.com/watch"}',
      'https://cdn.example.com/espn2.m3u8|Referer=https%3A%2F%2Fplayer.example.com%2F&User-Agent=ignored',
      '#EXTINF:-1,Next', 'https://cdn.example.com/next.m3u8',
    ].join('\n');
    const [first, second] = parseM3U(text, IPTV_ORG_SPORTS_URL);
    expect(first).toMatchObject({ tvgId: 'ESPN2.us@HD', name: 'ESPN 2 (720p)', quality: 'HD', group: 'News;Sports', tags: ['ESPN2', 'News', 'Sports'], referer: 'https://player.example.com/', logo: 'https://images.example.com/a,b.svg?width=2048', url: 'https://cdn.example.com/espn2.m3u8' });
    expect(second.referer).toBeUndefined(); expect(second.group).toBeUndefined();
    expect(parseM3U('#EXTM3U\n#EXTINF:-1 tvg-logo="javascript:alert(1)",Unsafe logo\nhttps://cdn.example.com/safe.m3u8', IPTV_ORG_SPORTS_URL)[0].logo).toBeUndefined();
  });
});
