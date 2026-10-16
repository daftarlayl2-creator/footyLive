/**
 * Global predictor leaderboard — pure ranking logic.
 *
 * Shared by the leaderboard store (`lib/leaderboard/server.ts`), the API route
 * and the `/leaderboard` table. Rows are produced from real settled
 * predictions (server-side outcomes), never client claims:
 *
 *   accuracy  = correct / settled (whole percent, null before any settle)
 *   streak    = consecutive correct calls, counting back from the last settle
 *   badges    = active achievement badges derived from the record itself
 */

export interface PredictorStats {
  userId: string;
  /** Display handle the fan votes under ('' when they never sent one). */
  handle: string;
  settled: number;
  correct: number;
  wrong: number;
  /** Correct calls in a row right now. */
  streak: number;
  bestStreak: number;
  /** Epoch ms of the latest settled outcome. */
  lastOutcomeAt: number;
  /** Extra flair from wallet badges (e.g. 'golden-lemon'), if known. */
  flairs: string[];
  /** True for showcase rows written by the LimonElite seed. */
  seeded: boolean;
  updatedAt: number;
}

export interface LeaderboardBadge {
  id: string;
  label: string;
  emoji: string;
}

export interface RankedPredictor extends PredictorStats {
  rank: number;
  accuracy: number | null;
  badges: LeaderboardBadge[];
}

/** Achievement badges a predictor currently holds. */
export const LEADERBOARD_BADGES: Record<string, LeaderboardBadge> = {
  'hot-hand': { id: 'hot-hand', label: 'Hot Hand', emoji: '🔥' },
  sharpshooter: { id: 'sharpshooter', label: 'Sharpshooter', emoji: '🎯' },
  marathon: { id: 'marathon', label: 'Marathon', emoji: '🏃' },
  legend: { id: 'legend', label: 'Legend', emoji: '👑' },
  'golden-lemon': { id: 'golden-lemon', label: 'Golden Lemon', emoji: '🍋' },
  supporter: { id: 'supporter', label: 'Supporter', emoji: '💛' },
};

export function accuracyOf(stats: Pick<PredictorStats, 'settled' | 'correct'>): number | null {
  if (!stats.settled) return null;
  return Math.round((stats.correct / stats.settled) * 100);
}

/** Badges implied by the record right now (wallet flairs are merged in). */
export function badgesFor(stats: PredictorStats): LeaderboardBadge[] {
  const badges: LeaderboardBadge[] = [];
  const accuracy = accuracyOf(stats);
  if (stats.streak >= 3) badges.push(LEADERBOARD_BADGES['hot-hand']);
  if (accuracy !== null && accuracy >= 75 && stats.settled >= 8) badges.push(LEADERBOARD_BADGES.sharpshooter);
  if (stats.settled >= 25) badges.push(LEADERBOARD_BADGES.marathon);
  if (stats.bestStreak >= 10) badges.push(LEADERBOARD_BADGES.legend);
  for (const flair of stats.flairs || []) {
    const badge = LEADERBOARD_BADGES[flair];
    if (badge && !badges.some((b) => b.id === badge.id)) badges.push(badge);
  }
  return badges;
}

/**
 * Applies one settled outcome to a predictor's record.
 * `correct` must come from a server-side settlement of the real result.
 */
export function applyOutcome(
  stats: PredictorStats,
  outcome: { correct: boolean; at: number; handle?: string }
): PredictorStats {
  const correct = Boolean(outcome.correct);
  return {
    ...stats,
    handle: (outcome.handle || stats.handle || '').slice(0, 24),
    settled: stats.settled + 1,
    correct: stats.correct + (correct ? 1 : 0),
    wrong: stats.wrong + (correct ? 0 : 1),
    streak: correct ? stats.streak + 1 : 0,
    bestStreak: Math.max(stats.bestStreak, correct ? stats.streak + 1 : 0),
    lastOutcomeAt: Math.max(stats.lastOutcomeAt, outcome.at),
    updatedAt: Math.max(stats.updatedAt, outcome.at),
  };
}

/**
 * Live ranking: accuracy first (the table is about who calls matches right),
 * then volume of correct calls, then the longest streak, then total settled.
 * Every input row gets its rank, accuracy and active badges.
 */
export function rankPredictors(rows: PredictorStats[]): RankedPredictor[] {
  return rows
    .map((row) => ({ ...row, accuracy: accuracyOf(row), badges: badgesFor(row) }))
    .sort((a, b) => {
      const accA = a.accuracy ?? -1;
      const accB = b.accuracy ?? -1;
      if (accA !== accB) return accB - accA;
      if (a.correct !== b.correct) return b.correct - a.correct;
      if (a.bestStreak !== b.bestStreak) return b.bestStreak - a.bestStreak;
      if (a.settled !== b.settled) return b.settled - a.settled;
      return (b.lastOutcomeAt || 0) - (a.lastOutcomeAt || 0);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Blank record for a fan who has not settled anything yet. */
export function emptyPredictorStats(userId: string, handle = ''): PredictorStats {
  return {
    userId,
    handle: handle.slice(0, 24),
    settled: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    lastOutcomeAt: 0,
    flairs: [],
    seeded: false,
    updatedAt: 0,
  };
}
