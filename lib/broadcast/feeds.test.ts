import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseM3U, splitExtinfPayload } from './m3u';
import { parseJsonFeed } from './json';
import {
  buildLiveChannels,
  channelIdFor,
  findChannelSources,
  getFeedUrls,
  isPlayableFeedUrl,
  normalizeChannelTitle,
  parseFeedText,
  toPlaybackUrl,
  DEFAULT_LIVE_FEEDS,
  MAX_CHANNEL_SOURCES,
} from './feeds';
import { PROXY_PATH, verifyProxySignature } from '../hlsProxy';
import { probeChannel, withTimeout } from './probe';

// Shaped after the real ibstvofficial/Live-events playlist.
const FEED_URL = 'https://raw.githubusercontent.com/ibstvofficial/Live-events/main/playlist.m3u';
const SAMPLE_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="" tvg-logo="https://bdixiptvbd.com/logo.png" group-title="IBS TV PROMOTION",--- [ IBS TV PROMOTION ] ---',
  'https://bdixiptvbd.com/live/Telegram.mp4',
  '#EXTINF:-1,Telegram Channel: https://t.me/ibstvbd',
  'https://bdixiptvbd.com/live/Telegram.mp4',
  '#EXTINF:-1 tvg-id="sonyliv-1090548028" tvg-logo="https://origin-staticv2.sonyliv.com/a_thumb.jpg" group-title="Football", LASK vs Liverpool - 14 Oct 2026 | UEFA Champions League 2026-27',
  'https://sonydaimenew.akamaized.net/hls/live/2120302/Footlive1410/ENG/std_lrh-800300010.m3u8?hdnea=exp=1792038041~acl=/*~hmac=abc',
  '#EXTINF:-1 tvg-id="sonyliv-1090548027" group-title="Football",Feyenoord vs Como - 14 Oct 2026',
  'https://sonydaimenew.akamaized.net/hls/live/2120301/Footlive1410/ENG/std_lrh-800300010.m3u8?hdnea=exp=1792038050~acl=/*~hmac=def',
].join('\n');

describe('M3U parsing', () => {
  it('reads tvg attributes, group and title from #EXTINF', () => {
    const [promo, , lask] = parseM3U(SAMPLE_M3U, FEED_URL);
    expect(promo.name).toBe('--- [ IBS TV PROMOTION ] ---');
    expect(lask.name).toBe('LASK vs Liverpool - 14 Oct 2026 | UEFA Champions League 2026-27');
    expect(lask.tvgId).toBe('sonyliv-1090548028');
    expect(lask.group).toBe('Football');
    expect(lask.logo).toContain('sonyliv.com');
    expect(lask.source).toBe('raw.githubusercontent.com');
    expect(lask.url).toMatch(/\.m3u8\?hdnea=/);
  });

  it('keeps commas inside quoted attribute values out of the title', () => {
    const { attrs, title } = splitExtinfPayload('-1 tvg-name="A, B" group-title="X, Y",Real Title');
    expect(title).toBe('Real Title');
    expect(attrs).toContain('tvg-name="A, B"');
  });

  it('applies #EXTVLCOPT referrer and #EXTHTTP headers to the following URL only', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:-1,One',
      '#EXTVLCOPT:http-referrer=https://embed.example.com/',
      'https://cdn.example.com/one/index.m3u8',
      '#EXTINF:-1,Two',
      'https://cdn.example.com/two/index.m3u8',
      '#EXTINF:-1,Three',
      '#EXTHTTP:{"Referer":"https://three.example.com/"}',
      'https://cdn.example.com/three/index.m3u8',
    ].join('\n');
    const [one, two, three] = parseM3U(text, FEED_URL);
    expect(one.referer).toBe('https://embed.example.com/');
    expect(two.referer).toBeUndefined();
    expect(three.referer).toBe('https://three.example.com/');
  });

  it('drops non-http lines and falls back to the URL path when #EXTINF is missing', () => {
    const text = '#EXTM3U\nrtmp://x.example.com/live/a\nhttps://cdn.example.com/live/my-match.m3u8\n';
    const entries = parseM3U(text, FEED_URL);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('my-match');
  });
});

describe('JSON parsing', () => {
  it('accepts a bare array or a wrapped object with common field names', () => {
    const bare = JSON.stringify([{ title: 'A vs B', stream_url: 'https://cdn.example.com/a.m3u8', group: 'Football' }]);
    expect(parseJsonFeed(bare, FEED_URL)[0]).toMatchObject({ name: 'A vs B', group: 'Football' });

    const wrapped = JSON.stringify({
      events: [{ name: 'C vs D', url: 'https://cdn.example.com/c.m3u8', headers: { Referer: 'https://r.example.com/' } }],
    });
    const [c] = parseJsonFeed(wrapped, FEED_URL);
    expect(c.name).toBe('C vs D');
    expect(c.referer).toBe('https://r.example.com/');
  });

  it('expands a streams array into one entry per stream and skips unusable items', () => {
    const data = JSON.stringify({
      matches: [
        {
          name: 'E vs F',
          streams: ['https://cdn.example.com/e1.m3u8', { url: 'https://cdn.example.com/e2.m3u8', name: 'HD' }, { url: 'ftp://nope' }],
        },
        { name: 'no url here' },
      ],
    });
    const entries = parseJsonFeed(data, FEED_URL);
    expect(entries.map((e) => e.name)).toEqual(['E vs F (1)', 'HD']);
  });

  it('returns nothing for invalid JSON', () => {
    expect(parseJsonFeed('{not json', FEED_URL)).toEqual([]);
  });
});

describe('feed sniffing and config', () => {
  it('chooses the parser from the content', () => {
    expect(parseFeedText(SAMPLE_M3U, FEED_URL).length).toBeGreaterThan(0);
    expect(parseFeedText('[{"name":"x","url":"https://cdn.example.com/x.m3u8"}]', FEED_URL)).toHaveLength(1);
    expect(parseFeedText('<html>nope</html>', FEED_URL)).toEqual([]);
  });

  it('reads LIVE_FEED_URLS, defaulting when unset and disabling on empty', () => {
    expect(getFeedUrls(undefined)).toEqual(DEFAULT_LIVE_FEEDS);
    expect(getFeedUrls('')).toEqual([]);
    expect(getFeedUrls('https://a.example.com/p.m3u, ftp://bad, https://b.example.com/x.json')).toEqual([
      'https://a.example.com/p.m3u',
      'https://b.example.com/x.json',
    ]);
  });
});

describe('playable filtering and channel building', () => {
  it('only accepts public http(s) direct streams', () => {
    expect(isPlayableFeedUrl('https://cdn.example.com/live/index.m3u8?t=1')).toBe(true);
    expect(isPlayableFeedUrl('https://bdixiptvbd.com/live/Telegram.mp4')).toBe(true);
    expect(isPlayableFeedUrl('https://embed.example.com/match/1')).toBe(false);
    expect(isPlayableFeedUrl('http://localhost/live/index.m3u8')).toBe(false);
    expect(isPlayableFeedUrl('http://10.0.0.5/live/index.m3u8')).toBe(false);
  });

  it('drops promos, dedupes URLs and keeps ids stable across token rotation', () => {
    const entries = parseM3U(SAMPLE_M3U, FEED_URL);
    const channels = buildLiveChannels(entries);
    expect(channels.map((c) => c.name)).toEqual([
      'LASK vs Liverpool - 14 Oct 2026 | UEFA Champions League 2026-27',
      'Feyenoord vs Como - 14 Oct 2026',
    ]);

    const rotated = parseM3U(SAMPLE_M3U.replace(/hdnea=exp=1792038041/, 'hdnea=exp=1792099999'), FEED_URL);
    const rotatedChannels = buildLiveChannels(rotated);
    expect(rotatedChannels[0].id).toBe(channels[0].id);
    expect(rotatedChannels[0].url).not.toBe(channels[0].url);
  });

  it('suffixes ids when two different streams would share one', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:-1,Same Event',
      'https://cdn.example.com/a.m3u8',
      '#EXTINF:-1,Same Event',
      'https://cdn.example.com/b.m3u8',
    ].join('\n');
    const channels = buildLiveChannels(parseM3U(text, FEED_URL));
    expect(channels[0].id).toBe(channelIdFor(channels[0]));
    expect(channels[1].id).toBe(`${channels[0].id}-2`);
  });
});

describe('alternate channel sources', () => {
  const OTHER_FEED = 'https://mirror.example.com/live.json';
  const channels = buildLiveChannels([
    ...parseM3U(
      [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="sonyliv-1",LASK vs Liverpool - 14 Oct 2026',
        'https://cdn.example.com/lask/eng.m3u8',
        '#EXTINF:-1,Feyenoord vs Como',
        'https://cdn.example.com/fey/index.m3u8',
        '#EXTINF:-1 tvg-id="sonyliv-1",LASK v Liverpool (alt audio)',
        'https://cdn.example.com/lask/alt.m3u8',
        '#EXTINF:-1,LASK vs Liverpool - 14 Oct 2026',
        'https://backup.example.com/lask/index.m3u8',
        '#EXTINF:-1,Live Event',
        'https://cdn.example.com/generic-a.m3u8',
        '#EXTINF:-1,Live Event',
        'https://cdn.example.com/generic-b.m3u8',
      ].join('\n'),
      FEED_URL
    ),
    ...parseJsonFeed(
      JSON.stringify([
        { name: 'LASK vs Liverpool – 14 Oct 2026', streams: ['https://m.example.com/l1.m3u8', 'https://m.example.com/l2.m3u8'] },
        { id: 'sonyliv-1', name: 'Unrelated channel', url: 'https://m.example.com/u.m3u8' },
      ]),
      OTHER_FEED
    ),
  ]);
  const byUrl = (url: string) => channels.find((c) => c.url === url)!;

  it('normalises titles for comparison', () => {
    expect(normalizeChannelTitle('  LASK vs. Liverpool (2) ')).toBe('lask vs liverpool');
    expect(normalizeChannelTitle('Atlético – Real Madrid')).toBe('atletico real madrid');
  });

  it('collects same-feed tvg-id duplicates and same-title entries from every feed, requested channel first', () => {
    const lask = byUrl('https://cdn.example.com/lask/eng.m3u8');
    const sources = findChannelSources(channels, lask.id);
    expect(sources.map((s) => s.url)).toEqual([
      'https://cdn.example.com/lask/eng.m3u8',
      'https://cdn.example.com/lask/alt.m3u8', // same tvg-id, same feed
      'https://backup.example.com/lask/index.m3u8', // same title
      'https://m.example.com/l1.m3u8', // same title in another feed ("(1)" suffix ignored)
      'https://m.example.com/l2.m3u8',
    ]);
    // A tvg-id reused by another feed is not proof of the same channel.
    expect(sources.some((s) => s.name === 'Unrelated channel')).toBe(false);
  });

  it('starts from whichever duplicate was opened', () => {
    const backup = byUrl('https://backup.example.com/lask/index.m3u8');
    expect(findChannelSources(channels, backup.id)[0].url).toBe('https://backup.example.com/lask/index.m3u8');
  });

  it('does not merge channels on generic titles, and handles unknown ids', () => {
    const generic = byUrl('https://cdn.example.com/generic-a.m3u8');
    expect(findChannelSources(channels, generic.id)).toHaveLength(1);
    expect(findChannelSources(channels, byUrl('https://cdn.example.com/fey/index.m3u8').id)).toHaveLength(1);
    expect(findChannelSources(channels, 'ffffffffffffffff')).toEqual([]);
  });

  it(`caps the list at ${MAX_CHANNEL_SOURCES} sources`, () => {
    const many = buildLiveChannels(
      Array.from({ length: 12 }, (_, i) => ({
        name: 'Big Match Live',
        url: `https://cdn.example.com/big/${i}.m3u8`,
        source: 'feed.example.com',
        feedUrl: FEED_URL,
      }))
    );
    expect(findChannelSources(many, many[0].id)).toHaveLength(MAX_CHANNEL_SOURCES);
  });
});

describe('playback routing', () => {
  it('routes every channel through a signed, relative /api/proxy link carrying its referer', () => {
    const [entry] = buildLiveChannels(
      parseM3U('#EXTM3U\n#EXTINF:-1,Ref Test\n#EXTVLCOPT:http-referrer=https://embed.example.com/\nhttps://cdn.example.com/x/index.m3u8\n', FEED_URL)
    );
    const link = toPlaybackUrl(entry);
    expect(link.startsWith(`${PROXY_PATH}?`)).toBe(true);
    const params = new URLSearchParams(link.slice(PROXY_PATH.length + 1));
    const url = params.get('url')!;
    const ref = params.get('ref')!;
    const exp = Number(params.get('exp'));
    expect(url).toBe('https://cdn.example.com/x/index.m3u8');
    expect(ref).toBe('https://embed.example.com/');
    expect(verifyProxySignature(url, ref, exp, params.get('sig')!)).toBe(true);
  });
});

describe('probeChannel', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ch = { url: 'https://cdn.example.com/live/index.m3u8' };

  it('reports live for a real #EXTM3U playlist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('#EXTM3U\n#EXT-X-VERSION:3\n')));
    await expect(probeChannel(ch)).resolves.toBe('live');
  });

  it('reports offline for HTTP errors, HTML error pages and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    await expect(probeChannel(ch)).resolves.toBe('offline');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>blocked</html>', { status: 200 })));
    await expect(probeChannel(ch)).resolves.toBe('offline');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(probeChannel(ch)).resolves.toBe('offline');
  });

  it('withTimeout resolves to the fallback when the work is too slow', async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r('live'), 200));
    await expect(withTimeout(slow, 10, 'checking')).resolves.toBe('checking');
    await expect(withTimeout(Promise.resolve('live'), 50, 'checking')).resolves.toBe('live');
  });
});
