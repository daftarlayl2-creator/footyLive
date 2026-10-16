/**
 * Live match reactions — server-side counters.
 *
 * Every reaction dropped over a live stream (Fire, Goal Cheer, Whistle, Lemon
 * Vibe) is counted here so all viewers of the match share the same live
 * tallies. Storage goes through the shared cache manager (Upstash Redis when
 * configured, in-process memory otherwise) with an in-process copy so a cache
 * outage never zeroes the board. Increments are clamped per viewer and per
 * second — the counters are social feedback, never a scoreboard to game.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';

export type ReactionKind = 'fire' | 'goalCheer' | 'whistle' | 'lemonVibe';

export const REACTION_KINDS: readonly ReactionKind[] = ['fire', 'goalCheer', 'whistle', 'lemonVibe'];

/** Display metadata for the floating bubbles + soundboard buttons. */
export const REACTION_META: Record<ReactionKind, { emoji: string; label: string; sound: 'fire' | 'goalCheer' | 'whistle' | 'lemonVibe' }> = {
  fire: { emoji: '🔥', label: 'Fire', sound: 'fire' },
  goalCheer: { emoji: '⚽', label: 'Goal Cheer', sound: 'goalCheer' },
  whistle: { emoji: '📣', label: 'Whistle', sound: 'whistle' },
  lemonVibe: { emoji: '🍋', label: 'Lemon Vibe', sound: 'lemonVibe' },
};

export type ReactionCounts = Record<ReactionKind, number>;

export function emptyReactionCounts(): ReactionCounts {
  return { fire: 0, goalCheer: 0, whistle: 0, lemonVibe: 0 };
}

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === 'string' && (REACTION_KINDS as readonly string[]).includes(value);
}

/** One viewer cannot move a counter faster than this (ms). */
export const REACTION_THROTTLE_MS = 1_200;
/** Hard ceiling per counter, so nothing can grow unbounded. */
export const MAX_REACTION_COUNT = 1_000_000_000;
const STORE_TTL_S = 30 * 24 * 60 * 60;

const reactionsKey = (matchId: string) => `limon:reactions:v1:${matchId}`;
const memory = new Map<string, ReactionCounts>();
/** Per-viewer throttle: `${matchId}:${kind}:${viewer}` → last accepted time. */
const throttle = new Map<string, number>();

const validMatchId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value);

export function sanitizeCounts(raw: unknown): ReactionCounts {
  const counts = emptyReactionCounts();
  if (!raw || typeof raw !== 'object') return counts;
  for (const kind of REACTION_KINDS) {
    const value = Number((raw as Record<string, unknown>)[kind]);
    counts[kind] = Number.isFinite(value) && value > 0 ? Math.min(MAX_REACTION_COUNT, Math.floor(value)) : 0;
  }
  return counts;
}

async function readCounts(matchId: string): Promise<ReactionCounts> {
  try {
    const stored = await getCacheManager().get<unknown>(reactionsKey(matchId));
    if (stored) {
      const counts = sanitizeCounts(stored);
      memory.set(matchId, counts);
      return counts;
    }
  } catch (err) {
    logger.warn('Reaction counters read failed; using the in-process copy', { matchId, error: String(err) });
  }
  return memory.get(matchId) ?? emptyReactionCounts();
}

async function writeCounts(matchId: string, counts: ReactionCounts): Promise<ReactionCounts> {
  const clean = sanitizeCounts(counts);
  memory.set(matchId, clean);
  try {
    await getCacheManager().set(reactionsKey(matchId), clean, STORE_TTL_S);
  } catch (err) {
    logger.warn('Reaction counters write failed; kept in process', { matchId, error: String(err) });
  }
  return clean;
}

/** Live counters for one match. */
export async function loadReactionCounts(matchId: string): Promise<ReactionCounts> {
  if (!validMatchId(matchId)) return emptyReactionCounts();
  return readCounts(matchId);
}

export interface ReactResult {
  ok: boolean;
  counts: ReactionCounts;
  /** False when the viewer is throttled (counter left untouched). */
  counted: boolean;
}

/**
 * Count one reaction. `viewer` throttling keeps a spammer from inflating a
 * counter: extra taps inside `REACTION_THROTTLE_MS` still animate locally but
 * do not move the shared tally.
 */
export async function recordReaction(
  matchId: string,
  kind: unknown,
  viewer: string,
  now = Date.now()
): Promise<ReactResult> {
  if (!validMatchId(matchId)) return { ok: false, counts: emptyReactionCounts(), counted: false };
  const counts = await readCounts(matchId);
  if (!isReactionKind(kind)) return { ok: false, counts, counted: false };

  const throttleKey = `${matchId}:${kind}:${viewer || 'anonymous'}`;
  const last = throttle.get(throttleKey) ?? -Infinity;
  if (now - last < REACTION_THROTTLE_MS) return { ok: true, counts, counted: false };
  throttle.set(throttleKey, now);
  // Keep the throttle map from growing without bound across matches.
  if (throttle.size > 20_000) {
    for (const key of throttle.keys()) {
      throttle.delete(key);
      if (throttle.size <= 10_000) break;
    }
  }

  const next = sanitizeCounts({ ...counts, [kind]: counts[kind] + 1 });
  return { ok: true, counts: await writeCounts(matchId, next), counted: true };
}

/** Test helper: clears the in-process copies. */
export function resetReactionMemory(): void {
  memory.clear();
  throttle.clear();
}
