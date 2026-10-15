import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from './types';
import type { LiveChannel } from './broadcast/types';
import { buildLiveChannels } from './broadcast/feeds';
import { PROXY_PATH, verifyProxySignature } from './hlsProxy';

const services = vi.hoisted(() => ({
  espnMatches: vi.fn(),
  catalogue: vi.fn(),
  feed: vi.fn(),
  statuses: vi.fn(),
}));

vi.mock('./providers/espn', async () => {
  const actual = await vi.importActual<typeof import('./providers/espn')>('./providers/espn');
  return { ...actual, getEspnMatches: services.espnMatches };
});
vi.mock('./providers/watchFooty', () => ({
  WatchFootyProvider: class {
    id = 'watchfooty';
    name = 'WatchFooty';
    fetchMatches() { return services.catalogue(); }
    async resolveStreams(_title: string, _home: string, _away: string, _id: string, match: Match | null) {
      return (match?.sources ?? []).map((s) => ({ name: s.label, url: s.url, provider: this.id, quality: 'HD' }));
    }
  },
  getMatchDetails: vi.fn(), getMatchStats: vi.fn(), getLeagues: vi.fn(), getTopTeams: vi.fn(),
}));
vi.mock('./providers/cdnLive', () => ({
  CdnLiveProvider: class { id = 'cdnlive'; name = 'CDNLive'; async resolveStreams() { return []; } },
}));
vi.mock('./providers/streamedPk', () => ({
  StreamedPkProvider: class { id = 'streamed'; name = 'Streamed'; async resolveStreams() { return []; } },
}));
vi.mock('./broadcast/feeds', async () => {
  const actual = await vi.importActual<typeof import('./broadcast/feeds')>('./broadcast/feeds');
  return { ...actual, getLiveChannels: services.feed };
});
vi.mock('./broadcast/probe', () => ({ getChannelStatuses: services.statuses }));
vi.mock('./cache/cacheManager', () => ({
  getCacheManager: () => ({ swr: (_key: string, load: () => unknown) => load() }),
}));

import { getMatches, resolveAllStreams } from './streamEngine';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'espn-700001', title: 'Arsenal vs Liverpool', source: 'espn', sport: 'football', status: 'live',
    timestamp: Date.now(), tournament: 'Premier League', country: 'England', priority: 2,
    homeTeam: { name: 'Arsenal', badge: '' }, awayTeam: { name: 'Liverpool', badge: '' },
    leagueLogo: '', poster: '', venue: '', note: '', sources: [], fallbackChannels: [],
    currentMinute: "12'", currentMinuteNumber: 12, homeScore: 0, awayScore: 0,
    ...overrides,
  };
}

const CHANNELS = buildLiveChannels([
  { name: 'Roma vs Real Madrid - 15 Oct 2026', group: 'Football', url: 'https://cdn.example.com/roma/index.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/live.m3u' },
  { name: 'Man City vs PSG - 15 Oct 2026', group: 'Football', url: 'https://cdn.example.com/city/index.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/live.m3u' },
  { name: 'Gone vs Offline', group: 'Football', url: 'https://cdn.example.com/gone/index.m3u8', source: 'feed', feedUrl: 'https://feed.example.com/live.m3u' },
]);

function proxyTarget(link: string): string {
  expect(link.startsWith(`${PROXY_PATH}?`)).toBe(true);
  const params = new URLSearchParams(link.slice(PROXY_PATH.length + 1));
  const target = params.get('url')!;
  expect(verifyProxySignature(target, params.get('ref') || '', Number(params.get('exp')), params.get('sig')!)).toBe(true);
  return target;
}

beforeEach(() => {
  services.espnMatches.mockReset().mockResolvedValue([match()]);
  services.catalogue.mockReset().mockResolvedValue([]);
  services.feed.mockReset().mockResolvedValue(CHANNELS);
  services.statuses.mockReset().mockResolvedValue({
    [CHANNELS[0].id]: 'live', [CHANNELS[1].id]: 'unknown', [CHANNELS[2].id]: 'offline',
  });
});

describe('ESPN live stream backups', () => {
  it('previews active fallback channels on unlinked live cards, not upcoming/finished cards', async () => {
    services.espnMatches.mockResolvedValue([
      match(),
      match({ id: 'espn-700002', status: 'upcoming', sources: [] }),
      match({ id: 'espn-700003', status: 'finished', sources: [] }),
    ]);
    const matches = await getMatches();
    expect(matches[0]).toMatchObject({ feedStreamCount: 2, feedStreamIsFallback: true, sources: [] });
    expect(matches[1].feedStreamCount).toBeUndefined();
    expect(matches[2].feedStreamCount).toBeUndefined();
    // Preview metadata has no raw CDN URLs; the player resolves fresh proxy links.
    expect(JSON.stringify(matches[0])).not.toContain('cdn.example.com');
  });

  it('opens the player with signed, first-party links to confirmed/standby channels (never offline)', async () => {
    const fixture = match();
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.serverCount).toBe(2);
    expect(resolved.channels.map((ch) => ch.provider)).toEqual(['livefeed-fallback', 'livefeed-fallback']);
    expect(resolved.channels.map((ch) => proxyTarget(ch.url))).toEqual([CHANNELS[0].url, CHANNELS[1].url]);
    expect(resolved.channels[0].proxiedUrl).toBe(resolved.channels[0].url);
    expect(resolved.channels[0].kind).toBe('hls');
  });

  it('uses an exact M3U team match ahead of unrelated channels', async () => {
    const fixture = match({ title: 'Real Madrid vs Roma', homeTeam: { name: 'Real Madrid', badge: '' }, awayTeam: { name: 'Roma', badge: '' } });
    services.espnMatches.mockResolvedValue([fixture]);
    const [preview] = await getMatches();
    expect(preview).toMatchObject({ feedStreamCount: 1, feedStreamIsFallback: false });
    expect(services.statuses).not.toHaveBeenCalled();

    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.serverCount).toBe(1);
    expect(resolved.channels[0].provider).toBe('livefeed');
    expect(proxyTarget(resolved.channels[0].url)).toBe(CHANNELS[0].url);
  });

  it('retains match-specific catalogue servers first, with unrelated live channels only as backups', async () => {
    const fixture = match({ sources: [{ id: 'catalogue', source: 'wf', label: 'Server 1', url: 'https://catalogue.example.com/arsenal.m3u8' }] });
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels[0].provider).toBe('watchfooty');
    expect(resolved.channels.slice(1).map((ch) => ch.provider)).toEqual(['livefeed-fallback', 'livefeed-fallback']);
  });

  it('does not attach unrelated channels to upcoming ESPN fixtures, or known-offline channels', async () => {
    const fixture = match({ status: 'upcoming' });
    await expect(resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture))
      .rejects.toThrow('No streams available');
    expect(services.statuses).not.toHaveBeenCalled();

    services.statuses.mockResolvedValue(Object.fromEntries(CHANNELS.map((ch: LiveChannel) => [ch.id, 'offline'])));
    const [livePreview] = await getMatches();
    expect(livePreview.feedStreamCount).toBeUndefined();
    await expect(resolveAllStreams('Arsenal vs Liverpool', 'espn-700001', 'Arsenal', 'Liverpool', match()))
      .rejects.toThrow('No streams available');
  });
});
