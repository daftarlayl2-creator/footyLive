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

import { LiveFeedProvider, findMatchFeedChannels } from './liveFeed';
import { buildLiveChannels } from '../broadcast/feeds';
import { PROXY_PATH } from '../hlsProxy';
import { IPTV_ORG_SPORTS_URL } from '../broadcast/sources';

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

  it('only maps confident two-team listings, never official entries that must pass their media gate', () => {
    const channels = buildLiveChannels([
      { name: 'Man City vs PSG', group: 'Football', url: 'https://cdn.example.com/live.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
      { name: 'Basketball event', group: 'Basketball', url: 'https://cdn.example.com/basket.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/f.m3u' },
    ]);
    expect(findMatchFeedChannels(channels, 'Juventus vs Inter')).toEqual([]);
    expect(findMatchFeedChannels(channels, 'PSG vs Manchester City').map((ch) => ch.url)).toEqual([channels[0].url]);
    const official = buildLiveChannels([{ name: 'Arsenal vs Chelsea', url: 'https://cdn.example.com/official.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL }]);
    expect(findMatchFeedChannels(official, 'Arsenal vs Chelsea')).toEqual([]);
  });
});
