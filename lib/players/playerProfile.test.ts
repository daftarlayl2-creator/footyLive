import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMarketValue, normalizePlayerProfile, normalizeSeasonPerformance, playerAge, playerHref } from './normalize';
import { withShowcaseSnapshot } from './showcase';
import type { PlayerProfile } from './types';

const upstream = vi.hoisted(() => vi.fn());
const sportsDb = vi.hoisted(() => vi.fn());
vi.mock('@/lib/providers/espn', () => ({ espnFetch: upstream }));
vi.mock('@/lib/providers/http', () => ({ fetchJson: sportsDb }));
vi.mock('@/lib/cache/cacheManager', () => ({ getCacheManager: () => ({ swr: (_key: string, load: () => unknown) => load() }) }));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn() } }));
import { getPlayerProfile, PlayerDataUnavailableError } from './playerProfile';

const now = new Date('2026-10-15T12:00:00Z');
const athlete = {
  id: '362150', displayName: 'Lamine Yamal', fullName: 'Lamine Yamal Nasraoui Ebana',
  dateOfBirth: '2007-07-13T00:00:00Z', age: 16, jersey: '10', citizenship: 'Spain',
  flag: { href: 'https://cdn.example.com/esp.png' }, headshot: { href: 'https://cdn.example.com/yamal.png' },
  position: { displayName: 'Forward' },
  team: { id: '83', displayName: 'Barcelona', logo: 'https://cdn.example.com/barca.png', league: { slug: 'esp.1', name: 'La Liga' } },
};
const overview = { athlete };
const statistics = { splits: { categories: [
  { name: 'general', stats: [{ name: 'appearances', value: 8 }, { name: 'minutesPlayed', displayValue: '1,234' }] },
  { name: 'offensive', stats: [{ name: 'totalGoals', value: 0 }, { name: 'goalAssists', value: 3 }, { name: 'totalPasses', value: 100 }, { name: 'accuratePasses', value: 91 }] },
] } };
const roster = { season: { year: 2026, displayName: '2026-27 Spanish La Liga' }, team: athlete.team, athletes: [{ ...athlete, statistics }] };

const CUTOUT = 'https://r2.thesportsdb.com/images/media/player/cutout/yamal.png';
beforeEach(() => {
  upstream.mockReset();
  sportsDb.mockReset().mockResolvedValue({ player: [{ strPlayer: 'Lamine Yamal', strSport: 'Soccer', dateBorn: '2007-07-13', strCutout: CUTOUT }] });
});

describe('player profile normalization', () => {
  it('builds player identity, club context and all five season metrics without losing real zeroes', () => {
    const profile = normalizePlayerProfile(overview, roster, null, now)!;
    expect(profile).toMatchObject({ id: '362150', name: 'Lamine Yamal', age: 19, position: 'Forward', nationality: 'Spain', club: { id: '83', name: 'Barcelona' }, season: { current: true, appearances: 8, goals: 0, assists: 3, minutes: 1234, passAccuracy: 91 } });
    expect(profile.flag).toContain('esp.png');
    expect(profile.portrait).toContain('yamal.png');
  });

  it('calculates age at UTC birthday boundaries instead of trusting a stale provider age', () => {
    expect(playerAge(athlete.dateOfBirth, new Date('2026-07-12T23:59:59Z'))).toBe(18);
    expect(playerAge(athlete.dateOfBirth, new Date('2026-07-13T00:00:00Z'))).toBe(19);
    expect(playerAge('bad', now)).toBeUndefined();
    expect(playerAge('2030-01-01', now)).toBeUndefined();
  });

  it('does not invent values when statistics, market estimates or nationality are unavailable', () => {
    const profile = normalizePlayerProfile({ athlete: { id: 12, displayName: 'New Player' } }, null, null, now)!;
    expect(profile.season).toEqual({ label: 'Season not reported', current: false });
    expect(profile.marketValue).toBeUndefined();
    expect(profile.nationality).toBeUndefined();
    expect(profile.honors).toEqual([]);
    expect(normalizePlayerProfile({ athlete: { id: '../admin', displayName: 'Bad' } })).toBeNull();
    expect(normalizePlayerProfile({ athlete: { id: '12' } })).toBeNull();
  });

  it('keeps career totals out of current-season statistics and labels historical data honestly', () => {
    const historical = { ...roster, season: { displayName: '2024-25 Spanish La Liga' } };
    const performance = normalizeSeasonPerformance({ ...overview, statistics: { displayName: 'Career', stats: [{ name: 'totalGoals', value: 999 }] } }, historical, null, athlete.id, now);
    expect(performance).toMatchObject({ label: '2024-25 Spanish La Liga', current: false, goals: 0 });
    expect(normalizeSeasonPerformance({ ...overview, statistics: { displayName: 'Career', stats: [{ name: 'totalGoals', value: 999 }] } }, null, null, athlete.id, now).goals).toBeUndefined();
  });

  it('merges table categories for the same current season, while excluding another club and competition', () => {
    const season = { year: 2027, displayName: '2026-27' }; // ESPN can use the ending year in its numeric field
    const stats = { categories: [
      { names: ['appearances', 'minutesPlayed'], statistics: [
        { season: { year: 2025, displayName: '2025-26' }, team: { id: '83' }, stats: ['50', '4000'] },
        { season, team: { id: '83' }, league: { slug: 'esp.1', name: 'La Liga' }, stats: ['8', '600'] },
        { season, team: { id: '1' }, league: { slug: 'esp.1' }, stats: ['99', '9999'] },
      ] },
      { names: ['totalGoals', 'goalAssists', 'passCompletionPercentage'], statistics: [
        { season, team: { id: '83' }, league: { slug: 'esp.1', name: 'La Liga' }, stats: ['4', '3', '92.5%'] },
        { season, team: { id: '83' }, league: { slug: 'uefa.champions' }, stats: ['88', '99', '100%'] },
      ] },
    ] };
    expect(normalizeSeasonPerformance(overview, null, stats, athlete.id, now)).toMatchObject({ current: true, label: '2026-27', scope: 'La Liga', appearances: 8, goals: 4, assists: 3, minutes: 600, passAccuracy: 92.5 });
  });

  it('supports ESPN overview parallel stat tables and bounds pass accuracy', () => {
    const summary = { season: { displayName: '2026-27 La Liga' }, names: ['appearances', 'totalGoals', 'goalAssists', 'minutesPlayed', 'passAccuracy'], splits: [{ displayName: 'Regular season', stats: ['8', '4', '0', '600', '101%'] }] };
    expect(normalizeSeasonPerformance({ ...overview, statistics: summary }, null, null, athlete.id, now)).toMatchObject({ appearances: 8, goals: 4, assists: 0, minutes: 600 });
    expect(normalizeSeasonPerformance({ ...overview, statistics: summary }, null, null, athlete.id, now).passAccuracy).toBeUndefined();
  });

  it('does not divide by zero or consume an unrelated roster athlete', () => {
    const zeroPasses = structuredClone(roster);
    zeroPasses.athletes[0].statistics.splits.categories[1].stats = [{ name: 'totalPasses', value: 0 }, { name: 'accuratePasses', value: 0 }];
    expect(normalizeSeasonPerformance(overview, zeroPasses, null, athlete.id, now).passAccuracy).toBeUndefined();
    expect(normalizeSeasonPerformance(overview, roster, null, '999', now).appearances).toBeUndefined();
  });

  it('accepts only dated, sourced-safe market estimates and safe image protocols', () => {
    expect(normalizeMarketValue({ amount: 150_000_000, currency: 'eur', asOf: '2024-10-11', source: 'https://value.example/player' })).toMatchObject({ amount: 150_000_000, currency: 'EUR', asOf: '2024-10-11' });
    expect(normalizeMarketValue({ amount: 150_000_000, currency: 'EUR' })).toBeUndefined();
    const profile = normalizePlayerProfile({ athlete: { ...athlete, headshot: { href: 'javascript:alert(1)' }, flag: { href: 'data:text/html,bad' } } }, null, null, now)!;
    expect(profile.portrait).toBeUndefined();
    expect(profile.flag).toBeUndefined();
  });

  it('builds /player/[id] links with optional validated provider context', () => {
    expect(playerHref(362150)).toBe('/player/362150');
    expect(playerHref(362150, { clubId: '83', league: 'esp.1' })).toBe('/player/362150?club=83&league=esp.1');
    expect(playerHref(362150, { clubId: '../secret', league: '../../bad' })).toBe('/player/362150');
  });

  it('uses selected, dated example honors only for an identified player and never overwrites provider awards', () => {
    const profile = normalizePlayerProfile(overview, roster, null, now)!;
    const enriched = withShowcaseSnapshot(profile);
    expect(enriched.honors.map((honor) => honor.name)).toContain('Golden Boy');
    expect(enriched.honorsNote).toContain('through 2024');
    expect(enriched.marketValue?.asOf).toBe('2024-10-21');
    const other = { ...profile, dateOfBirth: '1990-01-01' } as PlayerProfile;
    expect(withShowcaseSnapshot(other).honors).toEqual([]);
    const provider = { ...profile, honors: [{ id: 'new', category: 'individual', name: 'Provider honor', years: ['2026'] }] } as PlayerProfile;
    expect(withShowcaseSnapshot(provider).honors).toEqual(provider.honors);
  });
});

describe('player data loading', () => {
  it('loads overview plus real club roster, tolerating a missing optional stats endpoint', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/362150/overview')) return overview;
      if (url.endsWith('/esp.1/teams/83/roster')) return roster;
      throw new Error('HTTP 404');
    });
    expect(await getPlayerProfile('362150')).toMatchObject({ name: 'Lamine Yamal', season: { appearances: 8, goals: 0 }, club: { id: '83' } });
  });

  it('gives a featured player a transparent cutout first, keeping the ESPN headshots as fallbacks', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/362150/overview')) return overview;
      if (url.endsWith('/esp.1/teams/83/roster')) return roster;
      throw new Error('HTTP 404');
    });
    const profile = await getPlayerProfile('362150');
    expect(profile?.featured).toBe(true);
    expect(profile?.portraits?.map(({ src }) => src)).toEqual([
      CUTOUT, 'https://cdn.example.com/yamal.png', 'https://a.espncdn.com/i/headshots/soccer/players/full/362150.png',
    ]);
    // A portrait outage never hides the player.
    sportsDb.mockRejectedValue(new Error('HTTP 429'));
    expect((await getPlayerProfile('362150', '83', 'esp.1'))?.portraits?.[0].src).toBe('https://cdn.example.com/yamal.png');
  });

  it('creates a roster-backed profile when a league does not support the athlete overview API', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/esp.1/teams/83/roster')) return roster;
      throw new Error('HTTP 404');
    });
    expect(await getPlayerProfile('362150', '83', 'esp.1')).toMatchObject({ name: 'Lamine Yamal', club: { id: '83' }, season: { appearances: 8 } });
  });

  it('distinguishes unknown players from retryable upstream outages', async () => {
    upstream.mockRejectedValue(new Error('HTTP 404'));
    expect(await getPlayerProfile('99999')).toBeNull();
    expect(await getPlayerProfile('99999', '83', 'esp.1')).toBeNull();
    upstream.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getPlayerProfile('99999')).rejects.toBeInstanceOf(PlayerDataUnavailableError);
  });

  it('rejects invalid ids before fetching and sanitizes context before constructing upstream URLs', async () => {
    expect(await getPlayerProfile('../bad')).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockRejectedValue(new Error('HTTP 404'));
    await getPlayerProfile('12', '../83', '../../bad');
    expect(upstream.mock.calls.every(([url]) => !String(url).includes('../'))).toBe(true);
  });
});
