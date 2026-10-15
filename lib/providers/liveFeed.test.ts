import { describe, it, expect, vi } from 'vitest';

vi.mock('../broadcast/feeds', async () => {
  const actual = await vi.importActual<typeof import('../broadcast/feeds')>('../broadcast/feeds');
  return {
    ...actual,
    getLiveChannels: vi.fn(async () =>
      actual.buildLiveChannels([
        {
          name: 'LASK vs Liverpool - 14 Oct 2026 | UEFA Champions League 2026-27',
          url: 'https://sonydaimenew.akamaized.net/hls/live/1/a/index.m3u8',
          source: 'raw.githubusercontent.com',
          feedUrl: 'https://feed.example.com/p.m3u',
        },
        {
          name: 'Chelsea vs Arsenal - Premier League',
          url: 'https://cdn.example.com/chelsea/index.m3u8',
          source: 'feed.example.com',
          feedUrl: 'https://feed.example.com/p.m3u',
        },
      ])
    ),
  };
});

vi.mock('../broadcast/probe', () => ({ getChannelStatuses: vi.fn() }));

import { LiveFeedProvider, findMatchFeedChannels, selectActiveFeedChannels } from './liveFeed';
import { getChannelStatuses } from '../broadcast/probe';
import { buildLiveChannels } from '../broadcast/feeds';
import { PROXY_PATH } from '../hlsProxy';

describe('LiveFeedProvider', () => {
  it('returns proxied streams only for fixtures whose teams appear in the feed title', async () => {
    const provider = new LiveFeedProvider();

    const hit = await provider.resolveStreams('Liverpool vs LASK', 'Liverpool', 'LASK', 'm1');
    expect(hit).toHaveLength(1);
    expect(hit[0].provider).toBe('livefeed');
    expect(hit[0].proxiedUrl!.startsWith(`${PROXY_PATH}?`)).toBe(true);

    const miss = await provider.resolveStreams('Juventus vs Inter', 'Juventus', 'Inter', 'm2');
    expect(miss).toEqual([]);
  });

  it('prioritizes confirmed football streams; skips known-offline and non-football listings', async () => {
    const channels = buildLiveChannels([
      { name: 'Yesterday vs Tomorrow', group: 'Football', url: 'https://cdn.example.com/off.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
      { name: 'Chelsea vs Arsenal', group: 'Football', url: 'https://cdn.example.com/unknown.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
      { name: 'Man City vs PSG', group: 'Football', url: 'https://cdn.example.com/live.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
      { name: 'Basketball event', group: 'Basketball', url: 'https://cdn.example.com/basket.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
    ]);
    vi.mocked(getChannelStatuses).mockResolvedValue({
      [channels[0].id]: 'offline', [channels[1].id]: 'unknown',
      [channels[2].id]: 'live', [channels[3].id]: 'live',
    });

    expect(findMatchFeedChannels(channels, 'Juventus vs Inter')).toEqual([]);
    const selected = await selectActiveFeedChannels(channels);
    expect(selected.map((ch) => ch.url)).toEqual([channels[2].url, channels[1].url]);
    expect(getChannelStatuses).toHaveBeenCalledWith(channels.slice(0, 3), { limit: 24 });
  });

  it('keeps unverified channels available when the probe service itself fails', async () => {
    const channels = buildLiveChannels([
      { name: 'One vs Two', group: 'Football', url: 'https://cdn.example.com/one.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
    ]);
    vi.mocked(getChannelStatuses).mockRejectedValueOnce(new Error('probes blocked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await selectActiveFeedChannels(channels)).toEqual(channels);
    } finally {
      warn.mockRestore();
    }
  });
});
