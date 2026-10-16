/**
 * Server-side store for "Who will win?" votes.
 *
 * One record per `user_id + match_id` (the key is exactly that pair), plus a
 * per-match voter index so the tally is computed server-side. Reads fall back to
 * an in-process copy so a cache outage never loses a fan's vote for the session.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { voteKey, tallyKey, type StoredVote, safeUsername } from './antiCheat';
import { isPrediction } from '@/lib/predictions';

const VOTE_TTL_S = 365 * 24 * 60 * 60;
const MAX_VOTERS_PER_MATCH = 5000;

const memoryVotes = new Map<string, StoredVote>();
const memoryTally = new Map<string, string[]>();

export function sanitizeVote(raw: unknown, matchId: string, userId: string): StoredVote | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as any;
  if (!isPrediction(value.prediction)) return null;
  if (String(value.matchId ?? '') !== matchId || String(value.userId ?? '') !== userId) return null;
  const createdAt = Number.isFinite(value.createdAt) ? Number(value.createdAt) : Date.now();
  const updatedAt = Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : createdAt;
  return {
    matchId,
    userId,
    username: safeUsername(value.username),
    prediction: value.prediction,
    createdAt,
    updatedAt,
    changes: Number.isFinite(value.changes) && value.changes > 0 ? Math.floor(value.changes) : 0,
  };
}

export async function readVote(matchId: string, userId: string): Promise<StoredVote | null> {
  if (!matchId || !userId) return null;
  const key = voteKey(matchId, userId);
  try {
    const stored = await getCacheManager().get<unknown>(key);
    const clean = sanitizeVote(stored, matchId, userId);
    if (clean) {
      memoryVotes.set(key, clean);
      return clean;
    }
  } catch (err) {
    logger.warn('Prediction vote read failed; using the in-process copy', { matchId, error: String(err) });
  }
  return memoryVotes.get(key) ?? null;
}

async function readTallyIds(matchId: string): Promise<string[]> {
  try {
    const stored = await getCacheManager().get<unknown>(tallyKey(matchId));
    const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length) memoryTally.set(matchId, ids);
    return ids;
  } catch (err) {
    logger.warn('Prediction tally read failed; using the in-process copy', { matchId, error: String(err) });
    return memoryTally.get(matchId) ?? [];
  }
}

/** Inserts or updates the single vote this fan has on this match. */
export async function writeVote(vote: StoredVote): Promise<StoredVote> {
  const key = voteKey(vote.matchId, vote.userId);
  const previous = memoryVotes.get(key) ?? null;
  const next: StoredVote = previous
    ? { ...vote, createdAt: previous.createdAt, changes: previous.changes + 1 }
    : vote;
  memoryVotes.set(key, next);

  try {
    await getCacheManager().set(key, next, VOTE_TTL_S);
    const ids = await readTallyIds(vote.matchId);
    if (!ids.includes(vote.userId)) {
      const updated = [...ids, vote.userId].slice(-MAX_VOTERS_PER_MATCH);
      memoryTally.set(vote.matchId, updated);
      await getCacheManager().set(tallyKey(vote.matchId), updated, VOTE_TTL_S);
    }
  } catch (err) {
    logger.warn('Prediction vote write failed; kept in process', { matchId: vote.matchId, error: String(err) });
  }
  return next;
}

/** Every vote cast on one match (server-side tally source). */
export async function loadMatchVotes(matchId: string): Promise<StoredVote[]> {
  const ids = await readTallyIds(matchId);
  const unique = [...new Set(ids)];
  const votes = await Promise.all(unique.map((userId) => readVote(matchId, userId)));
  return votes.filter((vote): vote is StoredVote => Boolean(vote));
}

/** All matches this fan has voted on, newest first. */
export async function loadUserVotes(userId: string): Promise<StoredVote[]> {
  if (!userId) return [];
  return [...memoryVotes.values()]
    .filter((vote) => vote.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Test helper: clears the in-process copies. */
export function resetPredictionMemory(): void {
  memoryVotes.clear();
  memoryTally.clear();
}
