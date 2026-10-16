import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { leaderboardRow, loadLeaderboard, recordPredictionOutcome, resetLeaderboardMemory, seedLeaderboardRow } from './server';

const user = (id: string) => `a3f1c2d4-4444-5555-8666-${id.padStart(12, '0')}`;

beforeEach(() => {
  store.clear();
  resetLeaderboardMemory();
});

describe('server-side global leaderboard', () => {
  it('records one settled outcome per fan per match and never double-counts', async () => {
    await recordPredictionOutcome({ userId: user('1'), handle: 'Ultra', matchId: 'espn-1', correct: true, at: 1000 });
    await recordPredictionOutcome({ userId: user('1'), handle: 'Ultra', matchId: 'espn-1', correct: true, at: 2000 });
    await recordPredictionOutcome({ userId: user('1'), handle: 'Ultra', matchId: 'espn-2', correct: false, at: 3000 });

    const row = await leaderboardRow(user('1'));
    expect(row).toMatchObject({ handle: 'Ultra', settled: 2, correct: 1, wrong: 1, streak: 0, rank: 1 });
    expect(row!.accuracy).toBe(50);
  });

  it('produces a live table with ranks, streaks and badges', async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordPredictionOutcome({ userId: user('1'), handle: 'Hot', matchId: `espn-${i}`, correct: true, at: 1000 + i });
    }
    await recordPredictionOutcome({ userId: user('2'), handle: 'Cold', matchId: 'espn-9', correct: false, at: 1500 });

    const { rows } = await loadLeaderboard();
    expect(rows).toHaveLength(2);
    expect(rows[0].handle).toBe('Hot');
    expect(rows[0].streak).toBe(3);
    expect(rows[0].badges.map((b) => b.id)).toContain('hot-hand');
    expect(rows[1].handle).toBe('Cold');
    expect(rows[1].accuracy).toBe(0);
  });

  it('seeds the showcase record once, marked as seed data and de-duplicated', async () => {
    await seedLeaderboardRow({
      userId: user('9'),
      handle: 'LimonElite',
      settled: 200,
      correct: 182,
      bestStreak: 14,
      at: 500,
      settledIds: ['elite-seed-1', 'elite-seed-2'],
    });
    // Re-settling an already-counted seeded match must not change the record.
    await recordPredictionOutcome({ userId: user('9'), handle: 'LimonElite', matchId: 'elite-seed-1', correct: true, at: 600 });

    const row = await leaderboardRow(user('9'));
    expect(row).toMatchObject({ settled: 200, correct: 182, streak: 14, bestStreak: 14, seeded: true });
    expect(row!.accuracy).toBe(91);
  });

  it('ignores malformed ids instead of inventing rows', async () => {
    expect(await recordPredictionOutcome({ userId: 'bad id!', matchId: 'espn-1', correct: true })).toBeNull();
    expect(await recordPredictionOutcome({ userId: user('1'), matchId: 'not a match', correct: true })).toBeNull();
    expect(await leaderboardRow('nope')).toBeNull();
    const { rows } = await loadLeaderboard();
    expect(rows).toHaveLength(0);
  });
});
