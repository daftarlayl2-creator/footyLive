import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from './types';
import type { LiveChannel } from './broadcast/types';
import { buildLiveChannels } from './broadcast/feeds';
import { PROXY_PATH, verifyProxySignature } from './hlsProxy';
import { IPTV_ORG_SPORTS_URL } from './broadcast/sources';
import { resetIptvOrgSelection } from './broadcast/iptvOrg';

const services = vi.hoisted(() => ({
  espnMatches: vi.fn(),
  catalogue: vi.fn(),
  feed: vi.fn(),
  statuses: vi.fn(),
  health: vi.fn(),
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
vi.mock('./broadcast/probe', () => ({
  getChannelStatuses: services.statuses,
  getChannelHealth: services.health,
}));
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
  resetIptvOrgSelection();
  services.health.mockReset().mockResolvedValue({});
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


const OFFICIAL = buildLiveChannels([
  { name: 'ESPN 2 HD (720p)', url: 'https://sports.example.com/espn2/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
  { name: 'beIN SPORTS XTRA (1080p)', url: 'https://sports.example.com/bein/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
  { name: 'ESPN 2 blocked', url: 'https://sports.example.com/blocked/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
]);
const working = (targets: Array<{ id: string; url: string }>) => Object.fromEntries(targets.map(({ id, url }) => [id, {
  status: url.includes('/blocked/') ? 'unknown' : 'live', mediaVerified: !url.includes('/blocked/'),
  latencyMs: url.includes('/espn2/') ? 100 : 50, checkedAt: Date.now(), successRate: 1, samples: 5,
}]));

describe('official sports integration in the shared match/Multi-View resolver', () => {
  it('injects only media-verified official backups, prefers the reported network, and signs all links', async () => {
    services.feed.mockResolvedValue(OFFICIAL);
    services.health.mockImplementation(async (targets) => working(targets));
    const fixture = match({ broadcasters: ['ESPN 2'] });
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels.map(({ coverage }) => coverage)).toEqual(['broadcaster', 'sports']);
    expect(resolved.channels.map(({ provider }) => provider)).toEqual(['iptv-org-fallback-broadcaster', 'iptv-org-fallback-sports']);
    expect(resolved.channels[0].name).toBe('ESPN 2 HD (720p)');
    expect(resolved.channels.every(({ health }) => health?.mediaVerified)).toBe(true);
    expect(resolved.channels.map(({ url }) => proxyTarget(url))).toEqual(OFFICIAL.slice(0, 2).map(({ url }) => url));
    expect(resolved.channels.every(({ url, proxiedUrl }) => url === proxiedUrl)).toBe(true);
    expect(resolved.channels.some(({ url }) => proxyTarget(url).includes('/blocked/'))).toBe(false);
    expect(services.statuses).not.toHaveBeenCalled();
  });

  it('never bypasses the health gate through the legacy feed provider, even for a two-team title', async () => {
    services.feed.mockResolvedValue([{ ...OFFICIAL[0], name: 'Arsenal vs Liverpool' }]);
    await expect(resolveAllStreams('Arsenal vs Liverpool', 'espn-700001', 'Arsenal', 'Liverpool', match())).rejects.toThrow('No streams available');
    expect(services.statuses).not.toHaveBeenCalled();
  });

  it('uses media-verified two-team evidence as fixture-specific rather than pretending every network is exact', async () => {
    services.feed.mockResolvedValue([{ ...OFFICIAL[0], name: 'Arsenal vs Liverpool (720p)' }]);
    services.health.mockImplementation(async (targets) => working(targets));
    const resolved = await resolveAllStreams('Arsenal vs Liverpool', 'espn-700001', 'Arsenal', 'Liverpool', match());
    expect(resolved.channels[0]).toMatchObject({ provider: 'iptv-org', coverage: 'fixture', health: { mediaVerified: true } });
  });

  it('keeps catalogue fixture servers ahead of unrelated official broadcasters', async () => {
    services.feed.mockResolvedValue(OFFICIAL);
    services.health.mockImplementation(async (targets) => working(targets));
    const fixture = match({ broadcasters: ['ESPN 2'], sources: [{ id: 'primary', source: 'wf', label: 'Fixture', url: 'https://catalogue.example.com/arsenal.m3u8' }] });
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels.map(({ provider }) => provider)).toEqual(['watchfooty', 'iptv-org-fallback-broadcaster', 'iptv-org-fallback-sports']);
  });

  it('does not offer unverified official preview counts or automatic backups for upcoming fixtures', async () => {
    services.feed.mockResolvedValue(OFFICIAL);
    const [unverified] = await getMatches();
    expect(unverified.feedStreamCount).toBeUndefined();
    services.health.mockImplementation(async (targets) => working(targets));
    const [verified] = await getMatches();
    expect(verified).toMatchObject({ feedStreamCount: 2, feedStreamIsFallback: true });
    expect(JSON.stringify(verified)).not.toContain('sports.example.com');
    const fixture = match({ status: 'upcoming', broadcasters: ['ESPN 2'] });
    await expect(resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture)).rejects.toThrow('No streams available');
  });
});
