import { beforeEach, describe, expect, it, vi } from 'vitest';
import team from '../providers/__fixtures__/espn-team-arsenal.json';
import schedule from '../providers/__fixtures__/espn-schedule-arsenal.json';
import fixtures from '../providers/__fixtures__/espn-fixtures-arsenal.json';
import roster from '../providers/__fixtures__/espn-roster-arsenal.json';
import search from '../providers/__fixtures__/espn-search-real-madrid.json';
import { mergeClubSchedules, type ClubMatch } from './espnClub';

const espnFetch = vi.fn();
const fetchJson = vi.fn();

vi.mock('@/lib/providers/espn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/espn')>();
  return { ...actual, espnFetch: (...args: unknown[]) => espnFetch(...args) };
});
vi.mock('@/lib/providers/http', () => ({ fetchJson: (...args: unknown[]) => fetchJson(...args), APP_USER_AGENT: 'test' }));
// Pass-through cache so every test hits the (mocked) upstream.
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({ swr: (_key: string, fn: () => Promise<unknown>) => fn() }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const { ClubDataUnavailableError, getClubCore, isUpstreamNotFound, resolveClub } = await import('./clubProfile');

beforeEach(() => {
  espnFetch.mockReset();
  fetchJson.mockReset();
});

describe('club core loading', () => {
  it('combines profile, schedules and roster into newest-first results and soonest-first fixtures', async () => {
    espnFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/all/teams/359')) return team;
      if (url.endsWith('/all/teams/359/schedule')) return schedule;
      if (url.endsWith('/all/teams/359/schedule?fixture=true')) return fixtures;
      if (url.endsWith('/eng.1/teams/359/roster')) return roster;
      throw new Error(`unexpected ${url}`);
    });

    const core = await getClubCore('359');
    expect(core?.club.name).toBe('Arsenal');
    expect(core?.results.map((m) => m.id)).toEqual(['401915417', '401879268']);
    expect(core?.fixtures.map((m) => m.id)).toEqual(['401878769']);
    expect(core?.squad.map((p) => p.name)).toEqual(['Kepa Arrizabalaga']);
    expect(core?.form).toEqual(['W', 'W']);
    expect(core?.homeVenue).toBe('Emirates Stadium');
  });

  it('falls back to the league-scoped schedule when the all-competitions feed fails', async () => {
    espnFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/all/teams/359')) return team;
      if (url.includes('/all/teams/359/schedule')) throw new Error('HTTP 500');
      if (url.endsWith('/eng.1/teams/359/schedule')) return schedule;
      if (url.endsWith('/eng.1/teams/359/schedule?fixture=true')) return fixtures;
      throw new Error('HTTP 500');
    });
    const core = await getClubCore('359');
    expect(core?.results).toHaveLength(2);
    expect(core?.fixtures).toHaveLength(1);
    expect(core?.squad).toEqual([]);
  });

  it('treats an unknown team id as not found', async () => {
    espnFetch.mockRejectedValue(new Error('HTTP 404'));
    await expect(getClubCore('999999')).resolves.toBeNull();
    await expect(getClubCore('not-a-number')).resolves.toBeNull();
  });

  it('reports an outage (retryable) instead of a misleading 404 when ESPN is down', async () => {
    espnFetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getClubCore('360')).rejects.toBeInstanceOf(ClubDataUnavailableError);
  });
});

describe('club resolution', () => {
  it('uses the ESPN id from the URL without searching', async () => {
    await expect(resolveClub('359-arsenal')).resolves.toEqual({ espnId: '359', slug: 'arsenal' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('resolves name-only slugs through ESPN search', async () => {
    fetchJson.mockResolvedValue(search);
    await expect(resolveClub('real-madrid')).resolves.toEqual({ espnId: '86', slug: 'real-madrid' });
    expect(String(fetchJson.mock.calls[0][0])).toContain('query=real%20madrid');
  });

  it('separates "no such club" from "search is down"', async () => {
    fetchJson.mockRejectedValueOnce(new Error('HTTP 404 for site.web.api.espn.com'));
    await expect(resolveClub('nobody-fc')).resolves.toEqual({ espnId: null, slug: 'nobody-fc' });
    fetchJson.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(resolveClub('somebody-fc')).rejects.toBeInstanceOf(ClubDataUnavailableError);
  });

  it('classifies upstream errors', () => {
    expect(isUpstreamNotFound(new Error('HTTP 404'))).toBe(true);
    expect(isUpstreamNotFound(new Error('HTTP 400 for site.api.espn.com'))).toBe(true);
    expect(isUpstreamNotFound(new Error('HTTP 503'))).toBe(false);
    expect(isUpstreamNotFound(new TypeError('fetch failed'))).toBe(false);
  });
});

describe('mergeClubSchedules conflict resolution', () => {
  function clubMatch(patch: Partial<ClubMatch>): ClubMatch {
    return {
      id: '700001',
      date: '2026-10-14T19:00Z',
      competition: 'Premier League',
      status: 'scheduled',
      isHome: true,
      home: { name: 'Arsenal' },
      away: { name: 'Chelsea' },
      opponent: { name: 'Chelsea' },
      ...patch,
    };
  }

  it('a fixtures-list scheduled copy cannot overwrite a finished result', () => {
    const finished = clubMatch({ status: 'finished', home: { name: 'Arsenal', score: 2 }, away: { name: 'Chelsea', score: 0 }, result: 'W' });
    const scheduled = clubMatch({ status: 'scheduled' });
    expect(mergeClubSchedules([finished], [scheduled])).toEqual([finished]);
  });

  it('a finished copy in the fixtures list beats a scheduled copy in results', () => {
    const finished = clubMatch({ status: 'finished', home: { name: 'Arsenal', score: 1 }, away: { name: 'Chelsea', score: 1 }, result: 'D' });
    const scheduled = clubMatch({ status: 'scheduled' });
    expect(mergeClubSchedules([scheduled], [finished])).toEqual([finished]);
  });

  it('a live fixtures copy beats a stale scheduled results copy', () => {
    const live = clubMatch({ status: 'live', statusDetail: "63'" });
    const scheduled = clubMatch({ status: 'scheduled' });
    expect(mergeClubSchedules([scheduled], [live])[0].status).toBe('live');
  });

  it('prefers the finished copy that carries scores', () => {
    const withScores = clubMatch({ status: 'finished', home: { name: 'Arsenal', score: 3 }, away: { name: 'Chelsea', score: 1 }, result: 'W' });
    const withoutScores = clubMatch({ status: 'finished' });
    expect(mergeClubSchedules([withoutScores], [withScores])).toEqual([withScores]);
    expect(mergeClubSchedules([withScores], [withoutScores])).toEqual([withScores]);
  });

  it('unions disjoint matches from both schedules', () => {
    const result = clubMatch({ id: '1', status: 'finished' });
    const fixture = clubMatch({ id: '2', status: 'scheduled' });
    expect(mergeClubSchedules([result], [fixture]).map((m) => m.id).sort()).toEqual(['1', '2']);
  });
});
