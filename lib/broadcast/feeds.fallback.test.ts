/**
 * Channels feed resilience tests: `getLiveChannels` must NEVER throw — it
 * serves the 10-minute memory cache, then the last-known-good list, then an
 * honest empty list (the hardcoded standby stub was removed in Phase 2/3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FEED_CACHE_TTL_S,
  DEFAULT_LIVE_FEEDS,
  STATIC_FALLBACK_CHANNELS,
  getFeedUrls,
  getLiveChannels,
  getStaticFallbackChannels,
  resetChannelMemoryCache,
} from './feeds';

vi.mock('../cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async () => null,
    set: async () => {},
    // The resilience chain in feeds.ts is under test, not the cache layer.
    swr: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  }),
}));

const PLAYABLE_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="evt-1",LASK vs Liverpool - 14 Oct 2026',
  'https://cdn.example.com/lask/index.m3u8?hdnea=exp=1',
  '#EXTINF:-1,Feyenoord vs Como - 14 Oct 2026',
  'https://cdn.example.com/fey/index.m3u8?hdnea=exp=1',
].join('\n');

describe('getLiveChannels fallback chain', () => {
  beforeEach(() => {
    resetChannelMemoryCache();
    delete (process.env as any).LIVE_FEED_URLS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetChannelMemoryCache();
    delete (process.env as any).LIVE_FEED_URLS;
  });

  it('serves an honest empty list when every feed path is down (no hardcoded stub)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const channels = await getLiveChannels();
    expect(channels).toEqual([]);
    // The retained definitions still exist for id recognition, unused by listings.
    expect(getStaticFallbackChannels()).toBe(STATIC_FALLBACK_CHANNELS);
    expect(STATIC_FALLBACK_CHANNELS.every((c) => c.id && c.url && c.name)).toBe(true);
  });

  it('serves the last-known-good list when a later refresh fails', async () => {
    const fetchMock = vi.fn(async () => new Response(PLAYABLE_M3U, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getLiveChannels();
    expect(first.map((c) => c.name)).toContain('LASK vs Liverpool - 14 Oct 2026');

    fetchMock.mockImplementation(async () => new Response('down', { status: 503 }));
    const second = await getLiveChannels();
    expect(second).toEqual(first);
  });

  it('serves the 10-minute memory cache without refetching', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const fetchMock = vi.fn(async () => new Response(PLAYABLE_M3U, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getLiveChannels();
    await getLiveChannels();
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_LIVE_FEEDS.length);

    // Just under the TTL: still cached. Past it: refreshed.
    now += FEED_CACHE_TTL_S * 1000 - 1;
    await getLiveChannels();
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_LIVE_FEEDS.length);

    now += 2;
    await getLiveChannels();
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_LIVE_FEEDS.length * 2);
  });

  it('never throws even when both fetch and fallbacks are exercised', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(getLiveChannels()).resolves.toBeTruthy();
  });

  it('respects an explicitly disabled feed configuration with an empty list', async () => {
    process.env.LIVE_FEED_URLS = '';
    expect(getFeedUrls('')).toEqual([]);
    await expect(getLiveChannels()).resolves.toEqual([]);
  });
});
