/**
 * Fan stats for the profile dashboard: prediction accuracy (this device's
 * "Who will win?" votes settled against final results), starred teams and
 * chat activity, plus a light fan level.
 *
 * Pure helpers; storage access goes through small injected adapters so the
 * same code runs in components and unit tests.
 */

import { isPrediction, type Prediction } from './predictions';

export const VOTE_KEY_PREFIX = 'eviv:vote:';
export const RESULTS_STORAGE_KEY = 'eviv:fan:results';
export const CHAT_ACTIVITY_STORAGE_KEY = 'eviv:fan:chat';

/** Unfinished results are re-checked after this long. */
export const RESULT_STALE_MS = 10 * 60 * 1000;
const MAX_CACHED_RESULTS = 200;
const MAX_CHAT_MATCHES = 300;

export interface DeviceVote {
  matchId: string;
  prediction: Prediction;
  /** Epoch ms the vote was cast (null for legacy entries). */
  at: number | null;
}

export interface MatchResult {
  /** 'finished' | 'live' | 'upcoming' | 'unknown' (not found upstream). */
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeName?: string;
  awayName?: string;
  /** Epoch ms of the last check. */
  checkedAt?: number;
}

export type ResultCache = Record<string, MatchResult>;
export type VoteOutcome = 'correct' | 'wrong' | 'pending';

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

/* -------------------------------------------------------------------------- */
/*  Predictions                                                               */
/* -------------------------------------------------------------------------- */

const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Result of a finished match as a prediction ('home' / 'draw' / 'away'). */
export function outcomeOf(homeScore: unknown, awayScore: unknown): Prediction | null {
  if (!isScore(homeScore) || !isScore(awayScore)) return null;
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

/** A vote is settled only once its match is finished with a known score. */
export function settleVote(vote: Pick<DeviceVote, 'prediction'>, result: MatchResult | null | undefined): VoteOutcome {
  if (!result || result.status !== 'finished') return 'pending';
  const outcome = outcomeOf(result.homeScore, result.awayScore);
  if (!outcome) return 'pending';
  return outcome === vote.prediction ? 'correct' : 'wrong';
}

export interface RecentPrediction {
  matchId: string;
  prediction: Prediction;
  outcome: VoteOutcome;
  at: number | null;
  result?: MatchResult;
}

export interface PredictionSummary {
  total: number;
  settled: number;
  correct: number;
  wrong: number;
  pending: number;
  /** Whole-number percentage of settled votes that were right (null before any settle). */
  accuracy: number | null;
  /** Correct calls in a row, counting back from the latest settled vote. */
  currentStreak: number;
  bestStreak: number;
  /** Most recent votes first. */
  recent: RecentPrediction[];
}

export function computePredictionStats(
  votes: DeviceVote[],
  results: ResultCache,
  { recentLimit = 5 }: { recentLimit?: number } = {}
): PredictionSummary {
  const chronological = [...votes].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  let correct = 0;
  let wrong = 0;
  let run = 0;
  let bestStreak = 0;
  const rows: RecentPrediction[] = [];

  for (const vote of chronological) {
    const result = results[vote.matchId];
    const outcome = settleVote(vote, result);
    if (outcome === 'correct') {
      correct += 1;
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else if (outcome === 'wrong') {
      wrong += 1;
      run = 0;
    }
    rows.push({ matchId: vote.matchId, prediction: vote.prediction, outcome, at: vote.at, result });
  }

  const settled = correct + wrong;
  return {
    total: votes.length,
    settled,
    correct,
    wrong,
    pending: votes.length - settled,
    accuracy: settled ? Math.round((correct / settled) * 100) : null,
    currentStreak: run,
    bestStreak,
    recent: rows.reverse().slice(0, Math.max(0, recentLimit)),
  };
}

/** Every vote this device cast (`eviv:vote:{matchId}` entries). */
export function readDeviceVotes(storage: StorageLike | null | undefined): DeviceVote[] {
  if (!storage) return [];
  const votes: DeviceVote[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(VOTE_KEY_PREFIX)) continue;
    const matchId = key.slice(VOTE_KEY_PREFIX.length);
    if (!matchId) continue;
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      if (value && isPrediction(value.prediction)) {
        votes.push({ matchId, prediction: value.prediction, at: Number.isFinite(value.at) ? Number(value.at) : null });
      }
    } catch {
      // Ignore corrupt entries.
    }
  }
  return votes;
}

/* -------------------------------------------------------------------------- */
/*  Result cache                                                              */
/* -------------------------------------------------------------------------- */

export function parseResultCache(raw: string | null | undefined): ResultCache {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const cache: ResultCache = {};
    for (const [id, entry] of Object.entries(value as Record<string, any>)) {
      if (entry && typeof entry.status === 'string') cache[id] = entry as MatchResult;
    }
    return cache;
  } catch {
    return {};
  }
}

/** Adds / replaces one match result (a finished result is never downgraded). */
export function mergeResult(cache: ResultCache, matchId: string, result: MatchResult, now = Date.now()): ResultCache {
  const previous = cache[matchId];
  if (previous?.status === 'finished' && result.status !== 'finished') return cache;
  return { ...cache, [matchId]: { ...result, checkedAt: result.checkedAt ?? now } };
}

/** JSON for storage, keeping the most recently checked entries. */
export function serializeResultCache(cache: ResultCache, maxEntries = MAX_CACHED_RESULTS): string {
  const entries = Object.entries(cache)
    .sort((a, b) => (b[1].checkedAt ?? 0) - (a[1].checkedAt ?? 0))
    .slice(0, maxEntries);
  return JSON.stringify(Object.fromEntries(entries));
}

/**
 * Match ids whose result should be (re)fetched: unknown ones and unfinished
 * ones not checked recently; most recent votes first, capped at `limit`.
 */
export function votesNeedingResults(
  votes: DeviceVote[],
  cache: ResultCache,
  { now = Date.now(), limit = 40, staleMs = RESULT_STALE_MS }: { now?: number; limit?: number; staleMs?: number } = {}
): string[] {
  return [...votes]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .filter((vote) => {
      const cached = cache[vote.matchId];
      if (!cached) return true;
      if (cached.status === 'finished') return false;
      return now - (cached.checkedAt ?? 0) > staleMs;
    })
    .slice(0, limit)
    .map((vote) => vote.matchId);
}

/** Normalises an `/api/match/{id}` payload into a cacheable result. */
export function resultFromApi(payload: any, now = Date.now()): MatchResult {
  const match = payload?.match;
  if (!match) return { status: 'unknown', checkedAt: now };
  const score = (value: unknown) => (isScore(value) ? value : null);
  return {
    status: typeof match.status === 'string' ? match.status : 'unknown',
    homeScore: score(match.homeScore),
    awayScore: score(match.awayScore),
    homeName: match.homeName || undefined,
    awayName: match.awayName || undefined,
    checkedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/*  Chat activity                                                             */
/* -------------------------------------------------------------------------- */

export interface ChatActivity {
  messages: number;
  reactions: number;
  /** Matches this device chatted in (most recent last). */
  matches: string[];
  lastAt: number | null;
}

export const EMPTY_CHAT_ACTIVITY: ChatActivity = Object.freeze({ messages: 0, reactions: 0, matches: [], lastAt: null }) as ChatActivity;

export function parseChatActivity(raw: string | null | undefined): ChatActivity {
  if (!raw) return EMPTY_CHAT_ACTIVITY;
  try {
    const value = JSON.parse(raw);
    const count = (n: unknown) => (Number.isFinite(n) && Number(n) > 0 ? Math.floor(Number(n)) : 0);
    return {
      messages: count(value?.messages),
      reactions: count(value?.reactions),
      matches: Array.isArray(value?.matches) ? value.matches.filter((m: unknown) => typeof m === 'string').slice(-MAX_CHAT_MATCHES) : [],
      lastAt: Number.isFinite(value?.lastAt) ? Number(value.lastAt) : null,
    };
  } catch {
    return EMPTY_CHAT_ACTIVITY;
  }
}

/** Activity after one more message / reaction in `matchId`. */
export function nextChatActivity(
  activity: ChatActivity,
  matchId: string,
  kind: 'message' | 'reaction',
  now = Date.now()
): ChatActivity {
  const id = String(matchId);
  const matches = kind === 'message' && !activity.matches.includes(id) ? [...activity.matches, id].slice(-MAX_CHAT_MATCHES) : activity.matches;
  return {
    messages: activity.messages + (kind === 'message' ? 1 : 0),
    reactions: activity.reactions + (kind === 'reaction' ? 1 : 0),
    matches,
    lastAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/*  Fan level                                                                 */
/* -------------------------------------------------------------------------- */

const LEVELS = [
  { at: 0, title: 'Rookie' },
  { at: 25, title: 'Supporter' },
  { at: 75, title: 'Regular' },
  { at: 150, title: 'Ultra' },
  { at: 300, title: 'Legend' },
] as const;

export interface FanLevel {
  level: number;
  title: string;
  points: number;
  /** Points needed for the next level (null at the top). */
  nextAt: number | null;
  /** 0–100 progress towards the next level. */
  progress: number;
}

/** Points: 10 per correct call, 2 per settled call, 1 per chat message, 3 per starred team. */
export function fanLevel(summary: Pick<PredictionSummary, 'correct' | 'settled'>, chat: Pick<ChatActivity, 'messages'>, starred: number): FanLevel {
  const points = summary.correct * 10 + summary.settled * 2 + Math.min(chat.messages, 200) + Math.max(0, starred) * 3;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].at) index = i;
  const next = LEVELS[index + 1];
  const floor = LEVELS[index].at;
  return {
    level: index + 1,
    title: LEVELS[index].title,
    points,
    nextAt: next ? next.at : null,
    progress: next ? Math.round(((points - floor) / (next.at - floor)) * 100) : 100,
  };
}
