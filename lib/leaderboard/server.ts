/**
 * Global predictor leaderboard — server-side store.
 *
 * Rankings are built from settled predictions only: every time the backend
 * settles a "Who will win?" vote against the real final score (the wallet
 * settle action and the predictions route), the outcome is recorded here at
 * most once per fan per match. `lib/predictions/leaderboard.ts` then ranks
 * everyone by accuracy, correct calls and win streaks and attaches the active
 * badges. Nothing a client sends can advance a streak.
 *
 * Storage goes through the shared cache manager (Upstash Redis when configured,
 * in-process memory otherwise), with an in-process copy so a cache outage never
 * loses a fan's record.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { loadWallet } from '@/lib/coins/server';
import {
  applyOutcome,
  emptyPredictorStats,
  rankPredictors,
  type LeaderboardBadge,
  type PredictorStats,
  type RankedPredictor,
} from '@/lib/predictions/leaderboard';

const STORE_KEY = 'limon:leaderboard:v1';
const STORE_TTL_S = 400 * 24 * 60 * 60;
const MAX_USERS = 500;
const MAX_SETTLED_IDS = 200;

interface StoredRow extends PredictorStats {
  /** Match ids already settled for this fan (one outcome per match, ever). */
  settledIds: string[];
}

interface LeaderboardStore {
  rows: Record<string, StoredRow>;
  /** Most-recently-settled first (capped). */
  order: string[];
  updatedAt: number;
}

/** Fresh empty store per call — never share `rows`/`order` references. */
const emptyStore = (): LeaderboardStore => ({ rows: {}, order: [], updatedAt: 0 });
const memory: { store: LeaderboardStore | null } = { store: null };

const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,63}$/.test(value);

const validMatchId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value);

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '').slice(0, max);

function sanitizeRow(raw: any): StoredRow | null {
  if (!raw || typeof raw !== 'object' || !validUserId(raw.userId)) return null;
  const row: StoredRow = {
    userId: raw.userId,
    handle: clean(raw.handle, 24),
    settled: Math.max(0, Math.floor(Number(raw.settled) || 0)),
    correct: Math.max(0, Math.floor(Number(raw.correct) || 0)),
    wrong: Math.max(0, Math.floor(Number(raw.wrong) || 0)),
    streak: Math.max(0, Math.floor(Number(raw.streak) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(raw.bestStreak) || 0)),
    lastOutcomeAt: Math.max(0, Math.floor(Number(raw.lastOutcomeAt) || 0)),
    flairs: Array.isArray(raw.flairs) ? raw.flairs.filter((f: unknown) => typeof f === 'string').slice(0, 8) : [],
    seeded: Boolean(raw.seeded),
    updatedAt: Math.max(0, Math.floor(Number(raw.updatedAt) || 0)),
    settledIds: Array.isArray(raw.settledIds)
      ? raw.settledIds.filter((id: unknown) => validMatchId(id)).slice(0, MAX_SETTLED_IDS)
      : [],
  };
  // The counters must always agree with their parts.
  row.settled = Math.max(row.settled, row.correct + row.wrong);
  return row;
}

function sanitizeStore(raw: unknown): LeaderboardStore {
  const store: LeaderboardStore = { rows: {}, order: [], updatedAt: 0 };
  if (!raw || typeof raw !== 'object') return store;
  const value = raw as Partial<LeaderboardStore>;
  for (const [id, row] of Object.entries(value.rows || {})) {
    const cleanRow = sanitizeRow({ ...(row as object), userId: id });
    if (cleanRow) store.rows[id] = cleanRow;
  }
  store.order = (Array.isArray(value.order) ? value.order : []).filter((id) => typeof id === 'string' && store.rows[id]).slice(0, MAX_USERS);
  for (const id of Object.keys(store.rows)) if (!store.order.includes(id)) store.order.push(id);
  store.order = store.order.slice(0, MAX_USERS);
  store.updatedAt = Math.max(0, Math.floor(Number(value.updatedAt) || 0));
  return store;
}

async function readStore(): Promise<LeaderboardStore> {
  try {
    const stored = await getCacheManager().get<unknown>(STORE_KEY);
    if (stored) {
      const store = sanitizeStore(stored);
      memory.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Leaderboard read failed; using the in-process copy', { error: String(err) });
  }
  return memory.store ?? emptyStore();
}

async function writeStore(store: LeaderboardStore): Promise<LeaderboardStore> {
  const clean = sanitizeStore({ ...store, updatedAt: Date.now() });
  memory.store = clean;
  try {
    await getCacheManager().set(STORE_KEY, clean, STORE_TTL_S);
  } catch (err) {
    logger.warn('Leaderboard write failed; kept in process', { error: String(err) });
  }
  return clean;
}

/** Test helper: clears the in-process copy. */
export function resetLeaderboardMemory(): void {
  memory.store = null;
}

export interface OutcomeInput {
  userId: string;
  /** The handle the fan voted with (empty is allowed). */
  handle?: string;
  matchId: string;
  correct: boolean;
  at?: number;
}

/**
 * Record one settled prediction outcome. Idempotent per `userId + matchId`:
 * a re-settlement of the same match never double-counts or re-extends a streak.
 */
export async function recordPredictionOutcome(input: OutcomeInput): Promise<PredictorStats | null> {
  if (!validUserId(input.userId) || !validMatchId(input.matchId)) return null;
  const at = Number.isFinite(input.at) ? Math.floor(Number(input.at)) : Date.now();
  const store = await readStore();
  const previous = store.rows[input.userId] ?? { ...emptyPredictorStats(input.userId), settledIds: [] };
  if (previous.settledIds.includes(input.matchId)) return previous;

  const next: StoredRow = {
    ...applyOutcome(previous, { correct: input.correct, at, handle: input.handle }),
    settledIds: [input.matchId, ...previous.settledIds].slice(0, MAX_SETTLED_IDS),
    flairs: previous.flairs,
    seeded: previous.seeded,
  };
  store.rows[input.userId] = next;
  store.order = [input.userId, ...store.order.filter((id) => id !== input.userId)].slice(0, MAX_USERS);
  await writeStore(store);
  return next;
}

/**
 * Seed a showcase career record (the LimonElite review account). Marked
 * `seeded: true` so the table can say so — same honesty rule as the rest of
 * the elite dossier.
 */
export async function seedLeaderboardRow(
  input: { userId: string; handle: string; settled: number; correct: number; bestStreak: number; at?: number; settledIds?: string[] }
): Promise<PredictorStats | null> {
  if (!validUserId(input.userId)) return null;
  const store = await readStore();
  const at = Number.isFinite(input.at) ? Math.floor(Number(input.at)) : Date.now();
  const settled = Math.max(0, Math.floor(input.settled));
  const correct = Math.min(settled, Math.max(0, Math.floor(input.correct)));
  const row: StoredRow = {
    userId: input.userId,
    handle: clean(input.handle, 24),
    settled,
    correct,
    wrong: settled - correct,
    streak: Math.min(correct, Math.max(0, Math.floor(input.bestStreak))),
    bestStreak: Math.min(correct, Math.max(0, Math.floor(input.bestStreak))),
    lastOutcomeAt: at,
    flairs: [],
    seeded: true,
    updatedAt: at,
    // Seeded matches are already counted in the career record: settling them
    // again later must never double-count or re-extend the streak.
    settledIds: (Array.isArray(input.settledIds) ? input.settledIds : []).filter(validMatchId).slice(0, MAX_SETTLED_IDS),
  };
  store.rows[input.userId] = row;
  store.order = [input.userId, ...store.order.filter((id) => id !== input.userId)].slice(0, MAX_USERS);
  await writeStore(store);
  return row;
}

export interface LeaderboardEntry extends RankedPredictor {
  badges: LeaderboardBadge[];
}

/**
 * The live table: top predictors with ranks, accuracy, streaks and badges.
 * Wallet flairs (Golden Lemon, Supporter) are merged in best-effort so a
 * redeemed badge lights up on the row without a second storage system.
 */
export async function loadLeaderboard(limit = 25): Promise<{ rows: LeaderboardEntry[]; updatedAt: number }> {
  const store = await readStore();
  const rows = Object.values(store.rows);
  const ranked = rankPredictors(rows).slice(0, Math.max(1, Math.min(100, limit)));

  const withFlairs = await Promise.all(ranked.map(async (row) => {
    try {
      const wallet = await loadWallet(row.userId);
      const flairs = wallet.grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.flair ?? grant.rewardId);
      return { ...row, flairs: flairs.length ? flairs : row.flairs };
    } catch {
      return row;
    }
  }));

  // Re-rank after flair merge so badge changes reflect immediately.
  return { rows: rankPredictors(withFlairs as PredictorStats[]).slice(0, ranked.length), updatedAt: store.updatedAt };
}

/** One fan's row + global rank (null when they have no settled prediction). */
export async function leaderboardRow(userId: string): Promise<LeaderboardEntry | null> {
  if (!validUserId(userId)) return null;
  const { rows } = await loadLeaderboard(MAX_USERS);
  return rows.find((row) => row.userId === userId) ?? null;
}
