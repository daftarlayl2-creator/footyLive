import { describe, it, expect } from 'vitest';
import {
  EMPTY_CHAT_ACTIVITY,
  computePredictionStats,
  fanLevel,
  mergeResult,
  nextChatActivity,
  outcomeOf,
  parseChatActivity,
  parseResultCache,
  readDeviceVotes,
  resultFromApi,
  serializeResultCache,
  settleVote,
  votesNeedingResults,
  type DeviceVote,
  type ResultCache,
} from './fanStats';

function memoryStorage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
}

const finished = (homeScore: number, awayScore: number) => ({ status: 'finished', homeScore, awayScore });

describe('outcomeOf / settleVote', () => {
  it('maps final scores to home / draw / away', () => {
    expect(outcomeOf(2, 1)).toBe('home');
    expect(outcomeOf(0, 0)).toBe('draw');
    expect(outcomeOf(1, 3)).toBe('away');
    expect(outcomeOf(undefined, 1)).toBeNull();
  });

  it('only settles finished matches with a score', () => {
    expect(settleVote({ prediction: 'home' }, finished(2, 1))).toBe('correct');
    expect(settleVote({ prediction: 'draw' }, finished(2, 1))).toBe('wrong');
    expect(settleVote({ prediction: 'home' }, { status: 'live', homeScore: 2, awayScore: 0 })).toBe('pending');
    expect(settleVote({ prediction: 'home' }, { status: 'finished' })).toBe('pending');
    expect(settleVote({ prediction: 'home' }, undefined)).toBe('pending');
  });
});

describe('computePredictionStats', () => {
  const votes: DeviceVote[] = [
    { matchId: 'a', prediction: 'home', at: 1 },
    { matchId: 'b', prediction: 'draw', at: 2 },
    { matchId: 'c', prediction: 'away', at: 3 },
    { matchId: 'd', prediction: 'away', at: 4 },
    { matchId: 'e', prediction: 'home', at: 5 },
  ];
  const results: ResultCache = {
    a: finished(1, 0), // correct
    b: finished(2, 2), // correct
    c: finished(3, 1), // wrong
    d: finished(0, 1), // correct
    e: { status: 'live', homeScore: 1, awayScore: 0 }, // pending
  };

  it('counts accuracy over settled votes only, with streaks', () => {
    const stats = computePredictionStats(votes, results);
    expect(stats).toMatchObject({ total: 5, settled: 4, correct: 3, wrong: 1, pending: 1, accuracy: 75, currentStreak: 1, bestStreak: 2 });
    expect(stats.recent.map((r) => [r.matchId, r.outcome])).toEqual([
      ['e', 'pending'],
      ['d', 'correct'],
      ['c', 'wrong'],
      ['b', 'correct'],
      ['a', 'correct'],
    ]);
  });

  it('reports no accuracy before anything settled', () => {
    expect(computePredictionStats([], {})).toMatchObject({ total: 0, accuracy: null, currentStreak: 0, bestStreak: 0, recent: [] });
  });
});

describe('readDeviceVotes', () => {
  it('reads eviv:vote:* entries and skips everything else', () => {
    const storage = memoryStorage({
      'eviv:vote:espn-1': JSON.stringify({ id: 'v1', prediction: 'home', at: 100 }),
      'eviv:vote:espn-2': JSON.stringify({ id: 'v2', prediction: 'draw' }),
      'eviv:vote:espn-3': 'not json',
      'eviv:vote:espn-4': JSON.stringify({ id: 'v4', prediction: 'maybe' }),
      'eviv:chat:name': 'Fan1234',
    });
    expect(readDeviceVotes(storage)).toEqual([
      { matchId: 'espn-1', prediction: 'home', at: 100 },
      { matchId: 'espn-2', prediction: 'draw', at: null },
    ]);
    expect(readDeviceVotes(null)).toEqual([]);
  });
});

describe('result cache', () => {
  it('never downgrades a finished result and round-trips through storage', () => {
    let cache = mergeResult({}, 'x', finished(1, 0), 10);
    cache = mergeResult(cache, 'x', { status: 'unknown' }, 20);
    expect(cache.x).toMatchObject({ status: 'finished', checkedAt: 10 });
    cache = mergeResult(cache, 'y', { status: 'live', homeScore: 0, awayScore: 0 }, 30);
    const restored = parseResultCache(serializeResultCache(cache, 1));
    expect(Object.keys(restored)).toEqual(['y']);
    expect(parseResultCache('garbage')).toEqual({});
  });

  it('picks votes whose results are missing or stale', () => {
    const votes: DeviceVote[] = [
      { matchId: 'done', prediction: 'home', at: 3 },
      { matchId: 'fresh-live', prediction: 'home', at: 2 },
      { matchId: 'stale-live', prediction: 'home', at: 1 },
      { matchId: 'unknown', prediction: 'home', at: 4 },
    ];
    const cache: ResultCache = {
      done: { ...finished(1, 1), checkedAt: 0 },
      'fresh-live': { status: 'live', checkedAt: 9_000 },
      'stale-live': { status: 'live', checkedAt: 0 },
    };
    expect(votesNeedingResults(votes, cache, { now: 10_000, staleMs: 5_000 })).toEqual(['unknown', 'stale-live']);
    expect(votesNeedingResults(votes, cache, { now: 10_000, staleMs: 5_000, limit: 1 })).toEqual(['unknown']);
  });

  it('normalises API payloads', () => {
    expect(resultFromApi({ match: { status: 'finished', homeScore: 2, awayScore: 1, homeName: 'A', awayName: 'B' } }, 5)).toEqual({
      status: 'finished', homeScore: 2, awayScore: 1, homeName: 'A', awayName: 'B', checkedAt: 5,
    });
    expect(resultFromApi({ match: null }, 5)).toEqual({ status: 'unknown', checkedAt: 5 });
  });
});

describe('chat activity', () => {
  it('counts messages, reactions and distinct matches', () => {
    let activity = nextChatActivity(EMPTY_CHAT_ACTIVITY, 'm1', 'message', 1);
    activity = nextChatActivity(activity, 'm1', 'message', 2);
    activity = nextChatActivity(activity, 'm2', 'reaction', 3);
    activity = nextChatActivity(activity, 'm2', 'message', 4);
    expect(activity).toEqual({ messages: 3, reactions: 1, matches: ['m1', 'm2'], lastAt: 4 });
    expect(parseChatActivity(JSON.stringify(activity))).toEqual(activity);
    expect(parseChatActivity('{"messages":-4}')).toMatchObject({ messages: 0 });
    expect(parseChatActivity(null)).toBe(EMPTY_CHAT_ACTIVITY);
  });
});

describe('fanLevel', () => {
  it('turns activity into a level with progress', () => {
    expect(fanLevel({ correct: 0, settled: 0 }, { messages: 0 }, 0)).toMatchObject({ level: 1, title: 'Rookie', points: 0, nextAt: 25, progress: 0 });
    expect(fanLevel({ correct: 3, settled: 4 }, { messages: 5 }, 2)).toMatchObject({ level: 2, title: 'Supporter', points: 49, nextAt: 75 });
    expect(fanLevel({ correct: 40, settled: 50 }, { messages: 10 }, 5)).toMatchObject({ title: 'Legend', nextAt: null, progress: 100 });
  });
});
