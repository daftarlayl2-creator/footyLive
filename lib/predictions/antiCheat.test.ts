import { describe, expect, it } from 'vitest';
import {
  KICKOFF_GRACE_MS,
  isLocked,
  normalizePhase,
  safeUsername,
  settleVote,
  settledOutcome,
  tallyPredictions,
  validateVote,
  voteKey,
} from './antiCheat';

const USER = 'a3f1c2d4-1111-4222-8333-444455556666';
const KICKOFF = Date.parse('2026-10-16T19:00:00Z');

describe('anti-cheat vote validation', () => {
  it('accepts a legal pick for an upcoming fixture and stamps it with the server clock', () => {
    const decision = validateVote({ matchId: 'espn-700001', userId: USER, prediction: 'home', kickoff: KICKOFF, status: 'upcoming', now: KICKOFF - 60_000 });
    expect(decision).toMatchObject({ ok: true, prediction: 'home', locked: false });
    expect(decision.at).toBe(KICKOFF - 60_000);
  });

  it('rejects anything that is not one of the three outcomes, a real match id or a real identity', () => {
    expect(validateVote({ matchId: 'espn-1', userId: USER, prediction: 'banana' })).toMatchObject({ ok: false, reason: 'invalid-prediction' });
    expect(validateVote({ matchId: '../admin', userId: USER, prediction: 'home' })).toMatchObject({ ok: false, reason: 'invalid-match' });
    expect(validateVote({ matchId: 'espn-1', userId: 'short', prediction: 'home' })).toMatchObject({ ok: false, reason: 'missing-user' });
  });

  it('locks automatically at kick-off and stays locked while the match is running or finished', () => {
    const base = { matchId: 'espn-1', userId: USER, prediction: 'away' as const, kickoff: KICKOFF };
    expect(validateVote({ ...base, status: 'upcoming', now: KICKOFF - KICKOFF_GRACE_MS - 1 }).ok).toBe(true);
    expect(validateVote({ ...base, status: 'upcoming', now: KICKOFF - KICKOFF_GRACE_MS })).toMatchObject({ ok: false, reason: 'locked-kickoff' });
    expect(validateVote({ ...base, status: 'upcoming', now: KICKOFF + 1 })).toMatchObject({ ok: false, reason: 'locked-kickoff' });
    expect(validateVote({ ...base, status: 'live', now: KICKOFF - 10 * 60_000 })).toMatchObject({ ok: false, reason: 'locked-started' });
    expect(validateVote({ ...base, status: 'finished', now: KICKOFF + 2 * 60 * 60_000 })).toMatchObject({ ok: false, reason: 'locked-finished' });
    // No kick-off time and no live flag: only an explicitly upcoming fixture is open.
    expect(validateVote({ ...base, kickoff: null, status: 'unknown' })).toMatchObject({ ok: false, reason: 'match-unknown' });
    expect(validateVote({ ...base, kickoff: null, status: 'upcoming' }).ok).toBe(true);
  });

  it('exposes the lock state used by the UI', () => {
    expect(isLocked({ kickoff: KICKOFF, status: 'upcoming', now: KICKOFF - 60_000 })).toBe(false);
    expect(isLocked({ kickoff: KICKOFF, status: 'upcoming', now: KICKOFF })).toBe(true);
    expect(isLocked({ status: 'live' })).toBe(true);
    expect(normalizePhase('POST')).toBe('unknown');
    expect(normalizePhase('FINISHED')).toBe('finished');
  });

  it('keys votes by user_id + match_id so one fan can never hold two rows on a match', () => {
    expect(voteKey('espn-700001', USER)).toBe(`limon:prediction:v1:espn-700001:${USER}`);
    expect(voteKey('espn-700001', USER)).not.toBe(voteKey('espn-700001', `${USER}-other`));
    expect(voteKey('espn-700002', USER)).not.toBe(voteKey('espn-700001', USER));
  });

  it('sanitises usernames before they are stored', () => {
    expect(safeUsername('<script>Ultra</script>')).toBe('scriptUltra/script');
    expect(safeUsername('   ')).toBe('Limon fan');
    expect(safeUsername('x'.repeat(80))).toHaveLength(24);
  });
});

describe('server-side settlement', () => {
  it('only settles a finished match with a real score', () => {
    expect(settledOutcome('live', 2, 1)).toBeNull();
    expect(settledOutcome('finished', '2', 1)).toBeNull();
    expect(settledOutcome('finished', 2, 1)).toBe('home');
    expect(settledOutcome('finished', 0, 2)).toBe('away');
    expect(settledOutcome('finished', 1, 1)).toBe('draw');
  });

  it('pays the reward exactly once, only for a correct pick', () => {
    const vote = { prediction: 'home' as const };
    expect(settleVote({ vote, status: 'finished', homeScore: 2, awayScore: 1, reward: 500 }))
      .toEqual({ settled: true, correct: true, outcome: 'home', coins: 500 });
    expect(settleVote({ vote, status: 'finished', homeScore: 2, awayScore: 1, alreadyAwarded: true, reward: 500 }))
      .toMatchObject({ correct: true, coins: 0, reason: 'already-awarded' });
    expect(settleVote({ vote, status: 'finished', homeScore: 0, awayScore: 1, reward: 500 }))
      .toMatchObject({ correct: false, coins: 0, reason: 'wrong' });
    expect(settleVote({ vote: null, status: 'finished', homeScore: 0, awayScore: 1, reward: 500 }))
      .toMatchObject({ coins: 0, reason: 'no-vote' });
    expect(settleVote({ vote, status: 'live', homeScore: 1, awayScore: 0, reward: 500 }))
      .toMatchObject({ settled: false, coins: 0, reason: 'not-finished' });
    // A malformed score never pays out.
    expect(settleVote({ vote, status: 'finished', homeScore: Number.NaN, awayScore: 0, reward: 500 }).coins).toBe(0);
  });

  it('tallies votes without leaking voter ids', () => {
    const tally = tallyPredictions([{ prediction: 'home' }, { prediction: 'home' }, { prediction: 'away' }], 'away');
    expect(tally).toEqual({ counts: { home: 2, draw: 0, away: 1 }, total: 3, mine: 'away' });
    expect(JSON.stringify(tally)).not.toContain(USER);
  });
});
