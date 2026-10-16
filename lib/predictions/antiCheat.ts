/**
 * Server-side anti-cheat rules for "Who will win?" predictions.
 *
 * Every rule below runs on the server against facts the server itself fetched
 * (the real kick-off time, the real match state) — never against client input:
 *
 *  1. one vote per `user_id + match_id` (the storage key itself is that pair);
 *  2. predictions lock automatically at kick-off and stay locked once the match
 *     is live/finished, so nobody can "predict" a score they can already see;
 *  3. rewards are settled on the backend from the final score and are credited
 *     at most once per match;
 *  4. only the three legal outcomes are accepted, and vote/changed-vote
 *     timestamps come from the server clock.
 */
import { isPrediction, type Prediction } from '@/lib/predictions';

export const PREDICTION_STATUSES = ['upcoming', 'live', 'finished', 'unknown'] as const;
export type MatchPhase = (typeof PREDICTION_STATUSES)[number];

/** How long before kick-off votes stop being accepted (0 = exactly at kick-off). */
export const PREDICTION_LOCK_LEAD_MS = 0;
/** Clock-skew tolerance when the server clock is compared with the provider kick-off. */
export const KICKOFF_GRACE_MS = 5_000;

export type RejectionReason =
  | 'invalid-prediction'
  | 'invalid-match'
  | 'missing-user'
  | 'locked-kickoff'
  | 'locked-started'
  | 'locked-finished'
  | 'match-unknown';

export interface VoteContext {
  matchId: string;
  userId: string;
  prediction: unknown;
  /** Epoch ms from the provider's fixture payload (server-fetched). */
  kickoff?: number | null;
  status?: string | null;
  now?: number;
}

export interface VoteDecision {
  ok: boolean;
  reason?: RejectionReason;
  prediction?: Prediction;
  /** Epoch ms the vote was cast (server clock). */
  at: number;
  /** True when the fixture has started, so the vote is refused. */
  locked: boolean;
}

const validMatchId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value);
const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);

export function normalizePhase(status: unknown): MatchPhase {
  const value = typeof status === 'string' ? status.toLowerCase() : '';
  return (PREDICTION_STATUSES as readonly string[]).includes(value) ? (value as MatchPhase) : 'unknown';
}

/** True once the fixture has started (live/finished, or past its kick-off time). */
export function isLocked({ kickoff, status, now = Date.now() }: { kickoff?: number | null; status?: string | null; now?: number }): boolean {
  const phase = normalizePhase(status);
  if (phase === 'live' || phase === 'finished') return true;
  if (typeof kickoff === 'number' && Number.isFinite(kickoff) && kickoff > 0) {
    // Strictly at kick-off (minus a few seconds of clock skew): a score that is
    // already on the board can never be "predicted".
    return now + PREDICTION_LOCK_LEAD_MS >= kickoff - KICKOFF_GRACE_MS;
  }
  // No kick-off and no live flag: only an explicitly upcoming fixture is open.
  return phase !== 'upcoming';
}

/** The single gate every vote goes through. */
export function validateVote(context: VoteContext): VoteDecision {
  const now = Number.isFinite(context.now) ? Number(context.now) : Date.now();
  const refused = (reason: RejectionReason): VoteDecision => ({
    ok: false,
    reason,
    at: now,
    locked: reason !== 'invalid-prediction' && reason !== 'invalid-match' && reason !== 'missing-user',
  });

  if (!validUserId(context.userId)) return refused('missing-user');
  if (!validMatchId(context.matchId)) return refused('invalid-match');
  if (!isPrediction(context.prediction)) return refused('invalid-prediction');

  const phase = normalizePhase(context.status);
  const locked = isLocked({ kickoff: context.kickoff, status: context.status, now });
  if (locked) {
    if (phase === 'finished') return refused('locked-finished');
    if (phase === 'live') return refused('locked-started');
    if (phase === 'unknown' && !(typeof context.kickoff === 'number' && context.kickoff > 0)) return refused('match-unknown');
    return refused('locked-kickoff');
  }

  return { ok: true, prediction: context.prediction, at: now, locked: false };
}

/** Key that makes `user_id + match_id` unique: one row per fan per match. */
export function voteKey(matchId: string, userId: string): string {
  return `limon:prediction:v1:${matchId}:${userId}`;
}
export function tallyKey(matchId: string): string {
  return `limon:prediction:tally:v1:${matchId}`;
}

export interface StoredVote {
  matchId: string;
  userId: string;
  username: string;
  prediction: Prediction;
  /** Server clock, first time this fan voted. */
  createdAt: number;
  /** Server clock of the latest change (equals createdAt for the first vote). */
  updatedAt: number;
  /** How many times this fan changed their pick (never more than one row). */
  changes: number;
}

/** Outcome of a finished match as a prediction (`null` while it is unfinished). */
export function settledOutcome(
  status: unknown,
  homeScore: unknown,
  awayScore: unknown
): Prediction | null {
  if (normalizePhase(status) !== 'finished') return null;
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return null;
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) return null;
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

export interface Settlement {
  settled: boolean;
  correct: boolean;
  outcome: Prediction | null;
  /** Coins the server will credit for this vote (0 unless it is a new win). */
  coins: number;
  reason?: 'not-finished' | 'already-awarded' | 'wrong' | 'no-vote';
}

/**
 * Server-side settlement: a vote only pays out when the server has the final
 * score, the pick matches it, and the match has not been paid before.
 */
export function settleVote({
  vote,
  status,
  homeScore,
  awayScore,
  alreadyAwarded,
  reward,
}: {
  vote: Pick<StoredVote, 'prediction'> | null | undefined;
  status: unknown;
  homeScore: unknown;
  awayScore: unknown;
  alreadyAwarded?: boolean;
  reward: number;
}): Settlement {
  const outcome = settledOutcome(status, homeScore, awayScore);
  if (!outcome) return { settled: false, correct: false, outcome: null, coins: 0, reason: 'not-finished' };
  if (!vote) return { settled: false, correct: false, outcome, coins: 0, reason: 'no-vote' };
  const correct = vote.prediction === outcome;
  if (!correct) return { settled: true, correct: false, outcome, coins: 0, reason: 'wrong' };
  if (alreadyAwarded) return { settled: true, correct: true, outcome, coins: 0, reason: 'already-awarded' };
  return { settled: true, correct: true, outcome, coins: Math.max(0, Math.floor(reward)) };
}

export function safeUsername(value: unknown): string {
  const raw = typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '';
  return raw ? raw.slice(0, 24) : 'Limon fan';
}

/** Public, own-vote-aware tally (never leaks voter ids). */
export function tallyPredictions(votes: Array<Pick<StoredVote, 'prediction'>>, mine?: Prediction | null) {
  const counts = { home: 0, draw: 0, away: 0 };
  for (const vote of votes) if (isPrediction(vote?.prediction)) counts[vote.prediction] += 1;
  return { counts, total: counts.home + counts.draw + counts.away, mine: mine ?? null };
}
