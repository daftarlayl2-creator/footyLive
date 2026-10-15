import { describe, expect, it } from 'vitest';
import { buildInsights, computeWinProbability, formPoints, summarizeH2H, type WinProbabilityInput } from './matchInsights';
import type { ClubMatch } from '@/lib/clubs/espnClub';

const meeting = (overrides: Partial<ClubMatch> = {}): ClubMatch => ({
  id: '1', date: '2026-01-01', competition: 'League', status: 'finished', isHome: true,
  home: { id: 'h', name: 'Home', score: 2 }, away: { id: 'a', name: 'Away', score: 1 }, opponent: { name: 'Away' },
  ...overrides,
});

describe('lightweight probability model', () => {
  it('uses no fabricated default when all factors are absent or one-sided', () => {
    expect(computeWinProbability({})).toBeNull();
    expect(computeWinProbability({ homeForm: ['W'], homePoints: 70 })).toBeNull();
    expect(formPoints(['W', 'L', 'D', 'W'])).toBe(7);
  });
  it.each<WinProbabilityInput>([
    { homeForm: ['W', 'D', 'W'], awayForm: ['L', 'D', 'L'] },
    { homePoints: 0, awayPoints: 0 },
    { homePoints: 100, awayPoints: 2, homePlayed: 38, awayPlayed: 5 },
    { h2h: { homeWins: 0, awayWins: 1, draws: 0, total: 1, avgGoals: 1 } },
  ])('returns bounded integer percentages summing to 100: %j', (input) => {
    const result = computeWinProbability(input)!;
    expect(result.home + result.draw + result.away).toBe(100);
    for (const percentage of Object.values(result)) {
      expect(Number.isInteger(percentage)).toBe(true);
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    }
  });
  it('responds to form, standing points and H2H independently', () => {
    const neutral = computeWinProbability({ homePoints: 30, awayPoints: 30 })!;
    expect(computeWinProbability({ homePoints: 50, awayPoints: 10 })!.home).toBeGreaterThan(neutral.home);
    expect(computeWinProbability({ homeForm: ['W', 'W', 'W', 'W', 'W'], awayForm: ['L', 'L', 'L', 'L', 'L'] })!.home).toBeGreaterThan(neutral.home);
    expect(computeWinProbability({ h2h: { homeWins: 0, awayWins: 5, draws: 0, total: 5, avgGoals: 2 } })!.away).toBeGreaterThan(neutral.away);
  });
  it('uses points per game when both appearances are known', () => {
    const balanced = computeWinProbability({ homePoints: 30, awayPoints: 15, homePlayed: 20, awayPlayed: 10 });
    expect(balanced).toEqual(computeWinProbability({ homePoints: 30, awayPoints: 30, homePlayed: 20, awayPlayed: 20 }));
  });
  it('rejects non-finite and negative table values', () => {
    expect(computeWinProbability({ homePoints: Infinity, awayPoints: 20 })).toBeNull();
    expect(computeWinProbability({ homePoints: -1, awayPoints: 20 })).toBeNull();
  });
});

describe('H2H and factual insights', () => {
  it('unions schedules, reorients away meetings, excludes future/current/incomplete fixtures', () => {
    const win = meeting();
    const lossAway = meeting({ id: '2', home: { id: 'a', name: 'Away', score: 3 }, away: { id: 'h', name: 'Home', score: 1 } });
    const draw = meeting({ id: '3', home: { id: 'h', name: 'Home', score: 0 }, away: { id: 'a', name: 'Away', score: 0 } });
    const result = summarizeH2H([
      win, win, lossAway, draw,
      meeting({ id: 'current', date: '2026-02-01' }),
      meeting({ id: 'future', date: '2026-03-01' }),
      meeting({ id: 'live', status: 'live' }),
      meeting({ id: 'missing', home: { id: 'h', name: 'Home' } }),
      meeting({ id: 'other', away: { id: 'x', name: 'Other', score: 0 } }),
    ], 'h', 'a', Date.parse('2026-02-01'));
    expect(result).toEqual({ total: 3, homeWins: 1, awayWins: 1, draws: 1, avgGoals: 7 / 3 });
  });
  it('never matches unknown team IDs or synthesises absent meetings', () => {
    expect(summarizeH2H([], 'h', 'a', Date.now())).toBeNull();
    expect(summarizeH2H([meeting()], '', '', Date.now())).toBeNull();
  });
  it('builds concise form and high-scoring history cards from real samples', () => {
    const lines = buildInsights({ homeName: 'Madrid', awayName: 'Barça', homeForm: ['W', 'W', 'W', 'D', 'W'], awayForm: ['W', 'D'], h2h: { homeWins: 2, awayWins: 2, draws: 1, total: 5, avgGoals: 3.2 } });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Madrid won 4 of their last 5');
    expect(lines[2]).toContain('avg 3.2 goals');
  });
  it('does not call low-scoring history high-scoring, or a missing team 0-point', () => {
    const lines = buildInsights({ homeName: 'Home', awayName: 'Away', homePoints: 50, h2h: { total: 1, homeWins: 0, awayWins: 0, draws: 1, avgGoals: 0 } });
    expect(lines.join(' ')).not.toContain('High-scoring');
    expect(lines.join(' ')).not.toContain('Away 0');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
