import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  REACTION_KINDS,
  REACTION_META,
  REACTION_THROTTLE_MS,
  emptyReactionCounts,
  isReactionKind,
  loadReactionCounts,
  recordReaction,
  resetReactionMemory,
  sanitizeCounts,
} from './server';

const MATCH = 'espn-700001';
const NOW = 1_700_000_000_000;

beforeEach(() => {
  store.clear();
  resetReactionMemory();
});

describe('live match reaction counters', () => {
  it('defines exactly the four stream reactions with emoji and soundboard tones', () => {
    expect(REACTION_KINDS).toEqual(['fire', 'goalCheer', 'whistle', 'lemonVibe']);
    for (const kind of REACTION_KINDS) {
      expect(REACTION_META[kind].emoji).toBeTruthy();
      expect(REACTION_META[kind].sound).toBe(kind);
      expect(isReactionKind(kind)).toBe(true);
    }
    expect(isReactionKind('confetti')).toBe(false);
  });

  it('shares counters across viewers and clamps them to sane numbers', async () => {
    const first = await recordReaction(MATCH, 'fire', 'viewer-a', NOW);
    expect(first.counted).toBe(true);
    expect(first.counts.fire).toBe(1);

    const second = await recordReaction(MATCH, 'fire', 'viewer-b', NOW + 100);
    expect(second.counts.fire).toBe(2);

    expect(await loadReactionCounts(MATCH)).toMatchObject({ fire: 2, goalCheer: 0 });
    expect(sanitizeCounts({ fire: 3.9, goalCheer: -5, whistle: 1e12, junk: 9 })).toMatchObject({
      fire: 3,
      goalCheer: 0,
      whistle: 1_000_000_000,
    });
  });

  it('throttles one viewer without blocking other fans', async () => {
    await recordReaction(MATCH, 'goalCheer', 'viewer-a', NOW);
    const spammed = await recordReaction(MATCH, 'goalCheer', 'viewer-a', NOW + 100);
    expect(spammed.counted).toBe(false);
    expect(spammed.counts.goalCheer).toBe(1);
    // After the throttle window the same viewer counts again…
    const later = await recordReaction(MATCH, 'goalCheer', 'viewer-a', NOW + REACTION_THROTTLE_MS);
    expect(later.counted).toBe(true);
    expect(later.counts.goalCheer).toBe(2);
    // …and a different viewer is unaffected meanwhile.
    const other = await recordReaction(MATCH, 'goalCheer', 'viewer-b', NOW + 200);
    expect(other.counted).toBe(true);
  });

  it('refuses unknown kinds and malformed matches without touching the board', async () => {
    await recordReaction(MATCH, 'whistle', 'viewer-a', NOW);
    const bad = await recordReaction(MATCH, 'nuke', 'viewer-a', NOW + 200);
    expect(bad.ok).toBe(false);
    const badMatch = await recordReaction('../etc/passwd', 'whistle', 'viewer-a', NOW + 200);
    expect(badMatch.ok).toBe(false);
    expect(await loadReactionCounts(MATCH)).toMatchObject({ whistle: 1 });
    expect(await loadReactionCounts('../etc/passwd')).toEqual(emptyReactionCounts());
  });
});
