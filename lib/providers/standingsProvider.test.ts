import { beforeEach, describe, expect, it, vi } from 'vitest';
import eng1 from './__fixtures__/espn-standings-eng1.json';
import leaders from './__fixtures__/espn-leaders-eng1.json';
import botola from './__fixtures__/sportsdb-table-botola.json';

const espnFetch = vi.fn();
const fetchJson = vi.fn();

vi.mock('./espn', () => ({ espnFetch: (...args: unknown[]) => espnFetch(...args) }));
vi.mock('./http', () => ({ fetchJson: (...args: unknown[]) => fetchJson(...args) }));
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({ swr: (_key: string, fn: () => Promise<unknown>) => fn() }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const { getStandingsBundle } = await import('./standingsProvider');

beforeEach(() => {
  espnFetch.mockReset();
  fetchJson.mockReset();
});

describe('standings provider', () => {
  it('bundles the ESPN table with goals and assists leaders', async () => {
    espnFetch.mockImplementation(async (url: string) => (url.endsWith('/eng.1/standings') ? eng1 : leaders));
    const bundle = await getStandingsBundle('eng.1');
    expect(bundle).toMatchObject({
      league: { slug: 'eng.1', name: 'Premier League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
      season: '2026-27',
      source: 'espn',
      partial: false,
      leadersAvailable: true,
    });
    expect(bundle?.groups[0].rows).toHaveLength(2);
    expect(bundle?.scorers[0].player.name).toBe('Erling Haaland');
    expect(bundle?.assists[0].player.name).toBe('Pascal Gross');
    expect(espnFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings',
      'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/statistics',
    ]);
  });

  it('still serves the table when only the leaders feed fails', async () => {
    espnFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/standings')) return eng1;
      throw new Error('HTTP 500');
    });
    const bundle = await getStandingsBundle('eng.1');
    expect(bundle?.groups[0].rows[0].team.name).toBe('Manchester City');
    expect(bundle?.scorers).toEqual([]);
    // League logo is derived from the standings payload when stats are missing.
    expect(bundle?.league.logo).toBe('https://a.espncdn.com/i/leaguelogos/soccer/500/23.png');
  });

  it('throws (so nothing stale-empty gets cached) when every feed fails', async () => {
    espnFetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getStandingsBundle('esp.1')).rejects.toThrow(/No standings data/);
  });

  it('serves Botola Pro from TheSportsDB and flags the partial table', async () => {
    fetchJson.mockResolvedValue(botola);
    const bundle = await getStandingsBundle('mar.1');
    expect(String(fetchJson.mock.calls[0][0])).toMatch(/lookuptable\.php\?l=4520&s=\d{4}-\d{4}$/);
    expect(bundle).toMatchObject({ source: 'thesportsdb', partial: true, leadersAvailable: false, scorers: [], assists: [] });
    expect(bundle?.groups[0].rows.map((r) => r.team.name)).toContain('Maghreb Fez');
    expect(espnFetch).not.toHaveBeenCalled();
  });

  it('returns null for leagues outside the catalogue', async () => {
    await expect(getStandingsBundle('xyz.9')).resolves.toBeNull();
  });
});
