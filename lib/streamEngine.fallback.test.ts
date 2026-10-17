import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from './types';
import type { LiveChannel } from './broadcast/types';
import { buildLiveChannels } from './broadcast/feeds';
import { PROXY_PATH, verifyProxySignature } from './hlsProxy';
import { GUOVIN_IPTV_API_URL, IPTV_ORG_SPORTS_URL } from './broadcast/sources';
import { resetIptvOrgSelection } from './broadcast/iptvOrg';
import { resetLiveBackupSelection } from './broadcast/backups';

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

/** Strong-probe results keyed by upstream URL fragment; unmatched targets stay unknown. */
function probeResults(rules: Record<string, 'live' | 'offline'>) {
  return async (targets: Array<{ id: string; url: string }>) => Object.fromEntries(targets.flatMap(({ id, url }) => {
    const status = Object.entries(rules).find(([needle]) => url.includes(needle))?.[1];
    return status ? [[id, { status, mediaVerified: status === 'live', latencyMs: status === 'live' ? 80 : null, checkedAt: Date.now(), successRate: status === 'live' ? 1 : 0, samples: 3 }]] : [];
  }));
}

beforeEach(() => {
  // These suites exercise the Live-TV-enabled behaviour; the flag-off path
  // is covered separately below.
  vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
  resetIptvOrgSelection();
  resetLiveBackupSelection();
  services.espnMatches.mockReset().mockResolvedValue([match()]);
  services.catalogue.mockReset().mockResolvedValue([]);
  services.feed.mockReset().mockResolvedValue(CHANNELS);
  services.statuses.mockReset().mockResolvedValue({});
  // Roma is on air, City is blocked (unknown) and the third listing is gone.
  services.health.mockReset().mockImplementation(probeResults({ '/roma/': 'live', '/gone/': 'offline' }));
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

  it('uses an exact M3U team match ahead of unrelated channels, which stay behind it as backups', async () => {
    const fixture = match({ title: 'Real Madrid vs Roma', homeTeam: { name: 'Real Madrid', badge: '' }, awayTeam: { name: 'Roma', badge: '' } });
    services.espnMatches.mockResolvedValue([fixture]);
    const [preview] = await getMatches();
    expect(preview).toMatchObject({ feedStreamCount: 1, feedStreamIsFallback: false });
    expect(services.health).not.toHaveBeenCalled();

    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels[0].provider).toBe('livefeed');
    expect(proxyTarget(resolved.channels[0].url)).toBe(CHANNELS[0].url);
    // A geo-blocked or expired fixture link must fail over instead of dead-ending.
    expect(resolved.channels.slice(1).map((ch) => [ch.provider, proxyTarget(ch.url)])).toEqual([['livefeed-fallback', CHANNELS[1].url]]);
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
    expect(services.health).not.toHaveBeenCalled();

    services.health.mockImplementation(probeResults(Object.fromEntries(CHANNELS.map((ch: LiveChannel) => [new URL(ch.url).pathname, 'offline' as const]))));
    const [livePreview] = await getMatches();
    expect(livePreview.feedStreamCount).toBeUndefined();
    await expect(resolveAllStreams('Arsenal vs Liverpool', 'espn-700001', 'Arsenal', 'Liverpool', match()))
      .rejects.toThrow('No streams available');
  });

  it('maps live fixtures from catalogue providers too, not only ESPN ids', async () => {
    const fixture = match({ id: 'wf-arsenal-liverpool', source: 'watchfooty' });
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels.map((ch) => ch.provider)).toEqual(['livefeed-fallback', 'livefeed-fallback']);
  });
});

const GUOVIN = buildLiveChannels([
  { name: 'CCTV-1', group: '📺央视频道', url: 'http://198.51.100.7/live/cctv1.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: '魅力足球', group: '🏀体育频道', url: 'http://198.51.100.8/live/mlzq.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: 'CCTV-5', group: '🏀体育频道', url: 'https://smart.example.org/Smart.php?id=cctv5', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
]);

describe('Guovin + IPTV-Org backup mapping (no early failure)', () => {
  it('serves media-verified Guovin sports streams when the event feed has nothing on air', async () => {
    services.feed.mockResolvedValue([...CHANNELS, ...GUOVIN]);
    services.health.mockImplementation(probeResults({ '/mlzq.': 'live', 'Smart.php': 'live', '/cctv1.': 'live', '/roma/': 'offline', '/city/': 'offline', '/gone/': 'offline' }));
    const fixture = match();
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels.map((ch) => [ch.name, ch.provider])).toEqual([
      ['魅力足球', 'guovin-fallback-sports'],
      ['CCTV-5', 'guovin-fallback-sports'],
    ]);
    // General TV (CCTV-1) never stands in for a football fixture; links are signed and first-party.
    expect(resolved.channels.map((ch) => proxyTarget(ch.url))).toEqual([GUOVIN[1].url, GUOVIN[2].url]);
    expect(resolved.channels.every((ch) => ch.kind === 'hls' && ch.health?.mediaVerified)).toBe(true);
  });

  it('never injects unverified Guovin entries', async () => {
    services.feed.mockResolvedValue(GUOVIN);
    services.health.mockResolvedValue({});
    const fixture = match();
    await expect(resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture)).rejects.toThrow('No streams available');
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
    services.health.mockResolvedValue({});
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
    services.health.mockResolvedValue({});
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

describe('Live TV feature flag (Phase 2: temporarily hidden)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('never auto-selects feed channels or backups while hidden', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'false');
    services.feed.mockResolvedValue(CHANNELS);
    // No feed preview counts on live cards…
    const [preview] = await getMatches();
    expect(preview.feedStreamCount).toBeUndefined();
    // …and a live fixture with only feed coverage resolves to no servers
    // instead of silently substituting TV channels.
    const fixture = match({ id: 'espn-999991' });
    await expect(resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture))
      .rejects.toThrow('No streams available');
  });

  it('still resolves match-specific catalogue servers while hidden', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'false');
    const fixture = match({
      id: 'espn-999992',
      sources: [{ id: 'primary', source: 'wf', label: 'Fixture', url: 'https://catalogue.example.com/arsenal.m3u8' }],
    });
    const resolved = await resolveAllStreams(fixture.title, fixture.id, fixture.homeTeam.name, fixture.awayTeam.name, fixture);
    expect(resolved.channels.map(({ provider }) => provider)).toEqual(['watchfooty']);
  });
});
