/**
 * Shared match-selection rules for the homepage and `/api/matches`, so both
 * surfaces always agree about which fixtures are visible:
 *
 *   - `live`     → always visible (authoritative upstream status).
 *   - `finished` → always visible for as long as the provider returns the
 *                  match (ESPN's ±1-day window bounds retention). A result
 *                  is never dropped because its *kick-off* is old, and a
 *                  bad timestamp cannot erase a verified final score.
 *   - `upcoming` → visible only with a valid kick-off time that has not
 *                  been stale for more than 30 minutes. A long-overdue
 *                  "upcoming" row is dropped rather than displayed as a
 *                  fabricated live match (status is never inferred here).
 */
import type { Match } from '../types';

/** How long an `upcoming` fixture may be past kick-off before it is stale. */
export const STALE_UPCOMING_GRACE_MS = 30 * 60 * 1000;

function hasValidTimestamp(match: Match): boolean {
  return Number.isFinite(match.timestamp) && match.timestamp > 0;
}

/** Single visibility predicate shared by every fixture surface. */
export function isVisibleMatch(match: Match, now: number = Date.now()): boolean {
  if (match.status === 'live') return true;
  if (match.status === 'finished') return true;
  return hasValidTimestamp(match) && match.timestamp >= now - STALE_UPCOMING_GRACE_MS;
}

/**
 * Visible matches in dashboard order: live first, then the next kick-offs,
 * then results (most recent kick-off first).
 */
export function selectVisibleMatches(matches: Match[], now: number = Date.now()): Match[] {
  const order: Record<Match['status'], number> = { live: 0, upcoming: 1, finished: 2 };
  return matches
    .filter((match) => isVisibleMatch(match, now))
    .sort((a, b) => {
      const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
      if (byStatus !== 0) return byStatus;
      if (a.status === 'finished') return b.timestamp - a.timestamp;
      return a.timestamp - b.timestamp;
    });
}
