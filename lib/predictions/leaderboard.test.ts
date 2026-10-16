import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  applyOutcome,
  badgesFor,
  emptyPredictorStats,
  rankPredictors,
  type PredictorStats,
} from './leaderboard';

const stats = (over: Partial<PredictorStats> = {}): PredictorStats => ({
  ...emptyPredictorStats('a3f1c2d4-3333-4444-8555-000000000001', 'Ultra'),
  ...over,
});

describe('global predictor leaderboard logic', () => {
  it('settles outcomes into accuracy and win streaks, resetting on a miss', () => {
    let row = stats();
    row = applyOutcome(row, { correct: true, at: 1000, handle: 'Ultra' });
    row = applyOutcome(row, { correct: true, at: 2000 });
    row = applyOutcome(row, { correct: true, at: 3000 });
    expect(row).toMatchObject({ settled: 3, correct: 3, wrong: 0, streak: 3, bestStreak: 3 });
    expect(accuracyOf(row)).toBe(100);

    row = applyOutcome(row, { correct: false, at: 4000 });
    expect(row).toMatchObject({ settled: 4, correct: 3, wrong: 1, streak: 0, bestStreak: 3 });
    expect(accuracyOf(row)).toBe(75);

    row = applyOutcome(row, { correct: true, at: 5000 });
    expect(row.streak).toBe(1);
    expect(row.bestStreak).toBe(3);
    expect(accuracyOf(row)).toBe(80);
    // No settled call → no accuracy, never a misleading 0%.
    expect(accuracyOf(stats())).toBeNull();
  });

  it('issues active badges from the record and redeemed flairs', () => {
    // 3-streak → Hot Hand.
    expect(badgesFor(stats({ streak: 3, settled: 3, correct: 3 })).map((b) => b.id)).toContain('hot-hand');
    // 75%+ over 8+ settled → Sharpshooter (but not at 74% or 7 settled).
    expect(badgesFor(stats({ settled: 8, correct: 6, streak: 0 })).map((b) => b.id)).toContain('sharpshooter');
    expect(badgesFor(stats({ settled: 8, correct: 5, streak: 0 })).map((b) => b.id)).not.toContain('sharpshooter');
    expect(badgesFor(stats({ settled: 7, correct: 7 })).map((b) => b.id)).not.toContain('sharpshooter');
    // 25 settled → Marathon; best streak 10 → Legend.
    expect(badgesFor(stats({ settled: 25, correct: 10 })).map((b) => b.id)).toContain('marathon');
    expect(badgesFor(stats({ bestStreak: 10, correct: 10, settled: 12 })).map((b) => b.id)).toContain('legend');
    // Wallet flair merges in without duplicates.
    const flairs = badgesFor(stats({ flairs: ['golden-lemon', 'golden-lemon'] }));
    expect(flairs.map((b) => b.id)).toEqual(['golden-lemon']);
  });

  it('ranks by accuracy, then correct calls, then best streak', () => {
    const ranked = rankPredictors([
      stats({ userId: 'a3f1c2d4-3333-4444-8555-00000000000a', handle: 'steady', settled: 10, correct: 8 }),
      stats({ userId: 'a3f1c2d4-3333-4444-8555-00000000000b', handle: 'hot', settled: 4, correct: 4, streak: 4, bestStreak: 4 }),
      stats({ userId: 'a3f1c2d4-3333-4444-8555-00000000000c', handle: 'cold', settled: 10, correct: 3 }),
    ]);
    expect(ranked.map((row) => row.handle)).toEqual(['hot', 'steady', 'cold']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].accuracy).toBe(100);
    expect(ranked[2].accuracy).toBe(30);
  });
});
