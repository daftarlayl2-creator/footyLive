import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { loadMatchVotes, readVote, resetPredictionMemory, writeVote } from './server';
import { voteKey } from './antiCheat';

const user = (id: string) => `a3f1c2d4-1111-4222-8333-${id.padStart(12, '0')}`;

const vote = (userId: string, prediction: 'home' | 'draw' | 'away', at = 1_000) => ({
  matchId: 'espn-700001', userId, username: 'Ultra', prediction, createdAt: at, updatedAt: at, changes: 0,
});

beforeEach(() => {
  store.clear();
  resetPredictionMemory();
});

describe('server-side prediction store', () => {
  it('keeps exactly one row per user_id + match_id, updating the pick in place', async () => {
    await writeVote(vote(user('1'), 'home'));
    const updated = await writeVote(vote(user('1'), 'away', 2_000));

    expect(updated).toMatchObject({ prediction: 'away', createdAt: 1_000, updatedAt: 2_000, changes: 1 });
    expect(store.has(voteKey('espn-700001', user('1')))).toBe(true);
    // The change did not create a second row.
    expect((await loadMatchVotes('espn-700001')).filter((row) => row.userId === user('1'))).toHaveLength(1);
    expect(await readVote('espn-700001', user('1'))).toMatchObject({ prediction: 'away' });
  });

  it('tallies every fan on a match, one vote each', async () => {
    await writeVote(vote(user('1'), 'home'));
    await writeVote(vote(user('2'), 'home'));
    await writeVote(vote(user('3'), 'draw'));
    await writeVote(vote(user('1'), 'draw', 5_000));

    const rows = await loadMatchVotes('espn-700001');
    expect(rows).toHaveLength(3);
    const counts = rows.reduce((acc, row) => ({ ...acc, [row.prediction]: (acc as any)[row.prediction] + 1 }), { home: 0, draw: 0, away: 0 });
    expect(counts).toEqual({ home: 1, draw: 2, away: 0 });
  });

  it('ignores forged or malformed stored rows and never returns another fan’s vote', async () => {
    store.set(voteKey('espn-700001', user('1')), { matchId: 'espn-700001', userId: user('2'), prediction: 'home', createdAt: 1 });
    expect(await readVote('espn-700001', user('1'))).toBeNull();
    store.set(voteKey('espn-700001', user('1')), { matchId: 'espn-700001', userId: user('1'), prediction: 'banana' });
    expect(await readVote('espn-700001', user('1'))).toBeNull();
    expect(await readVote('', '')).toBeNull();
  });

  it('keeps votes in process when the shared cache is unavailable', async () => {
    const cache = (await import('@/lib/cache/cacheManager')).getCacheManager();
    const failing = { get: async () => { throw new Error('redis down'); }, set: async () => { throw new Error('redis down'); } };
    vi.spyOn(await import('@/lib/cache/cacheManager'), 'getCacheManager').mockReturnValue(failing as any);
    await writeVote(vote(user('7'), 'away'));
    expect(await readVote('espn-700001', user('7'))).toMatchObject({ prediction: 'away' });
    expect(cache).toBeTruthy();
  });
});
