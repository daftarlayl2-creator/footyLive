import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubMatch } from '@/lib/clubs/espnClub';
import type { Match } from '@/lib/types';

vi.mock('@/lib/clubs/clubProfile', () => ({ resolveClub: vi.fn(async (param: string) => ({ espnId: param.split('-')[0] })) }));
vi.mock('@/lib/providers/espn', () => ({ espnFetch: vi.fn() }));
vi.mock('@/lib/providers/standingsProvider', () => ({ getStandingsBundle: vi.fn() }));
vi.mock('@/lib/clubs/espnClub', async (original) => ({ ...await original<typeof import('@/lib/clubs/espnClub')>(), normalizeTeamSchedule: vi.fn((json) => json) }));
import { espnFetch } from '@/lib/providers/espn';
import { getStandingsBundle } from '@/lib/providers/standingsProvider';
import { loadMatchInsights } from './loadMatchInsights';

const match = {
  id: 'espn-current', timestamp: Date.parse('2026-06-01'), leagueSlug: 'eng.1',
  homeTeam: { id: '1', name: 'Home', badge: '' }, awayTeam: { id: '2', name: 'Away', badge: '' },
} as Match;
const past: ClubMatch = { id: 'past', date: '2026-01-01', competition: 'League', isHome: true, status: 'finished', result: 'W', home: { id: '1', name: 'Home', score: 2 }, away: { id: '2', name: 'Away', score: 0 }, opponent: { id: '2', name: 'Away' } };
beforeEach(() => { vi.resetAllMocks(); });

describe('match insights data wiring', () => {
  it('loads both schedules and official points, excluding this fixture and later matches', async () => {
    vi.mocked(espnFetch).mockResolvedValue([past, { ...past, id: 'current', date: '2026-06-01' }, { ...past, id: 'future', date: '2027-01-01' }]);
    vi.mocked(getStandingsBundle).mockResolvedValue({ groups: [{ rows: [
      { team: { id: '1' }, points: 40, played: 20 }, { team: { id: '2' }, points: 30, played: 20 },
    ] }] } as any);
    const data = await loadMatchInsights(match);
    expect(data.coverage).toEqual({ form: true, standings: true, h2h: true });
    expect(data.homeForm).toEqual(['W']);
    expect(data.h2h?.total).toBe(1);
    expect(data.homePoints).toBe(40);
    expect(data.probabilities!.home + data.probabilities!.draw + data.probabilities!.away).toBe(100);
    expect(espnFetch).toHaveBeenCalledTimes(2);
    expect(getStandingsBundle).toHaveBeenCalledWith('eng.1');
  });
  it('survives total provider outage without inventing percentages or records', async () => {
    vi.mocked(espnFetch).mockRejectedValue(new Error('provider down'));
    vi.mocked(getStandingsBundle).mockRejectedValue(new Error('provider down'));
    const data = await loadMatchInsights(match);
    expect(data.probabilities).toBeNull();
    expect(data.homePoints).toBeNull();
    expect(data.coverage).toEqual({ form: false, standings: false, h2h: false });
    expect(data.insights).toHaveLength(2);
  });
  it('retains usable H2H from one schedule if the other request fails', async () => {
    vi.mocked(espnFetch).mockResolvedValueOnce([past]).mockRejectedValueOnce(new Error('away down'));
    vi.mocked(getStandingsBundle).mockResolvedValue(null);
    const data = await loadMatchInsights(match);
    expect(data.coverage).toEqual({ form: false, standings: false, h2h: true });
    expect(data.probabilities).not.toBeNull();
    expect(data.awayForm).toEqual([]);
  });
});
