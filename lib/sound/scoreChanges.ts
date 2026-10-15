/** Score baselines are scoped to a mounted observer; mount/reload never replays goals. */
export interface ScoreSnapshot {
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

export function validScores(score: ScoreSnapshot): boolean {
  return [score.homeScore, score.awayScore].every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
}

export function isGoalIncrement(previous: ScoreSnapshot | undefined, next: ScoreSnapshot): boolean {
  if (!previous || !validScores(previous) || !validScores(next)) return false;
  if (next.status !== 'live' && !(previous.status === 'live' && next.status === 'finished')) return false;
  // VAR corrections are not goals. A later genuine increase can still alert.
  return next.homeScore! >= previous.homeScore! && next.awayScore! >= previous.awayScore!
    && (next.homeScore! > previous.homeScore! || next.awayScore! > previous.awayScore!);
}

/** Shared across card, dashboard and watch observers to avoid overlapping alerts. */
export function createGoalDeduper() {
  const seen = new Map<string, number>();
  return (id: string, score: ScoreSnapshot, now = Date.now()): boolean => {
    const key = `${id}:${score.homeScore}:${score.awayScore}`;
    const last = seen.get(key);
    if (last !== undefined && now - last < 6 * 60 * 60 * 1000) return false;
    seen.set(key, now);
    if (seen.size > 500) seen.delete(seen.keys().next().value!);
    return true;
  };
}

export const claimGoalAlert = createGoalDeduper();
