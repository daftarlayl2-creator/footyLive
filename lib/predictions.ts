/**
 * Pure helpers for the "Who will win?" prediction bar.
 */

export type Prediction = 'home' | 'draw' | 'away';

export const PREDICTIONS: readonly Prediction[] = ['home', 'draw', 'away'] as const;

export type VoteCounts = Record<Prediction, number>;

export interface StoredVote {
  id: string;
  prediction: Prediction;
}

export function isPrediction(value: unknown): value is Prediction {
  return value === 'home' || value === 'draw' || value === 'away';
}

export function voteStorageKey(matchId: string | number): string {
  return `eviv:vote:${matchId}`;
}

/** Parses the per-match vote this device cast (`null` when absent/corrupt). */
export function parseStoredVote(raw: string | null | undefined): StoredVote | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.id === 'string' && value.id && isPrediction(value.prediction)) {
      return { id: value.id, prediction: value.prediction };
    }
  } catch {
    // Ignore corrupt entries.
  }
  return null;
}

/**
 * One vote per voter id: backend rows (id → prediction) merged with this
 * device's own vote, which always counts — even before the backend confirms.
 */
export function tallyVotes(rows: Map<string, Prediction> | Iterable<[string, Prediction]>, own: StoredVote | null): VoteCounts {
  const merged = new Map<string, Prediction>(rows instanceof Map ? rows : Array.from(rows));
  if (own) merged.set(own.id, own.prediction);
  const counts: VoteCounts = { home: 0, draw: 0, away: 0 };
  for (const prediction of merged.values()) {
    if (isPrediction(prediction)) counts[prediction] += 1;
  }
  return counts;
}

/**
 * Whole-number percentages that always add up to exactly 100 (largest
 * remainder method); all zeros when nobody has voted yet.
 */
export function toPercentages(counts: VoteCounts): VoteCounts {
  const total = counts.home + counts.draw + counts.away;
  if (total <= 0) return { home: 0, draw: 0, away: 0 };
  const raw = PREDICTIONS.map((key) => (counts[key] * 100) / total);
  const floored = raw.map((value) => Math.floor(value));
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0);
  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return { home: floored[0], draw: floored[1], away: floored[2] };
}
