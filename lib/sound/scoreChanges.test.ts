import { describe, expect, it } from 'vitest';
import { createGoalDeduper, isGoalIncrement, validScores } from './scoreChanges';

const live = (homeScore = 0, awayScore = 0) => ({ status: 'live', homeScore, awayScore });
describe('real goal detection', () => {
  it('never plays on initial load, absent scores or corrupt score payloads', () => {
    expect(isGoalIncrement(undefined, live(3, 2))).toBe(false);
    for (const homeScore of [undefined, null, NaN, -1, 1.2]) {
      expect(validScores({ homeScore, awayScore: 0 })).toBe(false);
      expect(isGoalIncrement({ status: 'live', homeScore, awayScore: 0 }, live(1))).toBe(false);
    }
  });
  it('detects either side, skipped polls, and the final goal at full time', () => {
    expect(isGoalIncrement(live(), live(1))).toBe(true);
    expect(isGoalIncrement(live(), live(0, 1))).toBe(true);
    expect(isGoalIncrement(live(), live(2, 1))).toBe(true);
    expect(isGoalIncrement(live(), { ...live(1), status: 'finished' })).toBe(true);
  });
  it('ignores identical polls, score corrections, and nonlive result changes', () => {
    expect(isGoalIncrement(live(1), live(1))).toBe(false);
    expect(isGoalIncrement(live(1), live())).toBe(false);
    expect(isGoalIncrement(live(2, 0), live(1, 1))).toBe(false);
    expect(isGoalIncrement({ ...live(), status: 'finished' }, { ...live(1), status: 'finished' })).toBe(false);
    expect(isGoalIncrement(live(), { ...live(1), status: 'upcoming' })).toBe(false);
  });
  it('deduplicates dashboard/card/watch alerts but not another match or next goal', () => {
    const claim = createGoalDeduper();
    expect(claim('one', live(1), 100)).toBe(true);
    expect(claim('one', live(1), 150)).toBe(false);
    expect(claim('two', live(1), 150)).toBe(true);
    expect(claim('one', live(2), 150)).toBe(true);
  });
});
