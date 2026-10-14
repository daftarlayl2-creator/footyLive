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

import { LiveFeedProvider } from './liveFeed';
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
});
