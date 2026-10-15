import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({ default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import { buildLiveChannels, fetchFeedText, parseFeedText, pickGuovinReleaseAsset } from './feeds';
import { GUOVIN_IPTV_API_URL, guovinContentsApiUrl, guovinVariant, isGuovinFeed } from './sources';

/** Shape of the generator's real output (emoji + Chinese groups, timestamp pseudo-channel first). */
const PLAYLIST = [
  '#EXTM3U x-tvg-url="https://example.com/epg.gz"',
  '#EXTINF:-1 tvg-id="CCTV-1" tvg-name="CCTV-1" group-title="🕘️更新时间",2026-10-12 11:25:51',
  'http://198.51.100.7:82/gslb/zbdq5.m3u8?id=cctv1hd',
  '#EXTINF:-1 tvg-id="CCTV-5" tvg-name="CCTV-5" group-title="🏀体育频道",CCTV-5',
  'http://198.51.100.9/live/cctv5hd.m3u8',
  '#EXTINF:-1 tvg-id="CCTV-5+" tvg-name="CCTV-5+" group-title="🏀体育频道",CCTV-5+',
  'https://smart.example.org/Smart.php?id=cctv5plus',
  '#EXTINF:-1 group-title="🏀体育频道",广东体育',
  'http://198.51.100.10:8888/rtp/239.77.0.112:5146',
  '#EXTINF:-1 group-title="🏀体育频道",魅力足球',
  'http://198.51.100.11/live/mlzq.flv',
].join('\n');

/** Newest first, as the API returns them: the GUI app release carries no playlists. */
const RELEASES = [
  { tag_name: '3.1.0', draft: false, assets: [{ name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/Guovin/iptv-api/releases/download/3.1.0/SHA256SUMS.txt' }] },
  { tag_name: 'playlist-20261012-112551-utc-plus-0800', draft: false, assets: [
    { name: 'ipv4.m3u', browser_download_url: 'https://github.com/Guovin/iptv-api/releases/download/playlist-20261012-112551-utc-plus-0800/ipv4.m3u' },
    { name: 'result.m3u', browser_download_url: 'https://github.com/Guovin/iptv-api/releases/download/playlist-20261012-112551-utc-plus-0800/result.m3u' },
  ] },
  { tag_name: 'playlist-20260928-123124-utc-plus-0800', draft: false, assets: [
    { name: 'result.m3u', browser_download_url: 'https://github.com/Guovin/iptv-api/releases/download/playlist-20260928-123124-utc-plus-0800/result.m3u' },
  ] },
];
const NEWEST_ASSET = RELEASES[1].assets[1].browser_download_url;

const text = (body: string, status = 200) => new Response(body, { status });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const contents = (body: string) => json({ encoding: 'base64', content: Buffer.from(body).toString('base64').replace(/(.{60})/g, '$1\n') });

afterEach(() => { vi.unstubAllGlobals(); });

describe('Guovin playlist transports', () => {
  it('recognises the Pages, release, raw and Contents API copies of each variant', () => {
    expect(guovinVariant(GUOVIN_IPTV_API_URL)).toBe('result');
    expect(guovinVariant('https://guovin.github.io/iptv-api/ipv6.m3u')).toBe('ipv6');
    expect(guovinVariant(NEWEST_ASSET)).toBe('result');
    expect(guovinVariant(guovinContentsApiUrl('ipv4'))).toBe('ipv4');
    expect(guovinContentsApiUrl('result')).toBe('https://api.github.com/repos/Guovin/iptv-api/contents/output/result.m3u?ref=gd');
    for (const lookalike of [
      'http://guovin.github.io/iptv-api/result.m3u',
      'https://user:pw@guovin.github.io/iptv-api/result.m3u',
      'https://github.com/evil/iptv-api/releases/download/x/result.m3u',
      'https://guovin.github.io/iptv-api/result.txt',
    ]) expect(isGuovinFeed(lookalike)).toBe(false);
  });

  it('picks the newest playlist release asset, never the GUI release or a foreign host', () => {
    expect(pickGuovinReleaseAsset(RELEASES, 'result')).toBe(NEWEST_ASSET);
    expect(pickGuovinReleaseAsset(RELEASES, 'ipv4')).toBe(RELEASES[1].assets[0].browser_download_url);
    expect(pickGuovinReleaseAsset(RELEASES, 'ipv6')).toBeNull();
    expect(pickGuovinReleaseAsset([{ assets: [{ name: 'result.m3u', browser_download_url: 'https://evil.example/result.m3u' }] }], 'result')).toBeNull();
    expect(pickGuovinReleaseAsset({ message: 'API rate limit exceeded' }, 'result')).toBeNull();
  });

  it('falls back to the latest release asset when GitHub Pages is down', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://guovin.github.io/')) return text('Not Found', 404);
      if (url.startsWith('https://api.github.com/repos/Guovin/iptv-api/releases')) return json(RELEASES);
      if (url === NEWEST_ASSET) return text(PLAYLIST);
      return text('unexpected', 500);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchFeedText(GUOVIN_IPTV_API_URL)).toBe(PLAYLIST);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(NEWEST_ASSET);
  });

  it('uses the gd branch through the Contents API when Pages and release downloads are blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://api.github.com/repos/Guovin/iptv-api/releases')) return json(RELEASES);
      if (url === guovinContentsApiUrl('result')) return contents(PLAYLIST);
      throw new TypeError('fetch failed');
    }));
    const playlist = await fetchFeedText(GUOVIN_IPTV_API_URL);
    const channels = buildLiveChannels(parseFeedText(playlist, GUOVIN_IPTV_API_URL));
    // Provenance stays the configured Pages URL, whatever transport answered.
    expect(channels.every((channel) => channel.feedUrl === GUOVIN_IPTV_API_URL)).toBe(true);
    // The timestamp pseudo-channel, multicast relays and FLV are dropped; HLS
    // redirectors (Smart.php) stay as probe-gated candidates.
    expect(channels.map((channel) => channel.name)).toEqual(['CCTV-5', 'CCTV-5+']);
  });

  it('reports a failure only when every transport is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => text('down', 503)));
    await expect(fetchFeedText(GUOVIN_IPTV_API_URL)).rejects.toThrow();
  });
});
