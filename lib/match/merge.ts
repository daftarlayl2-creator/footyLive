/**
 * Deterministic conflict resolution for duplicate match records.
 *
 * The same fixture can arrive from more than one fetch (e.g. two adjacent
 * ESPN day boards, or a cached list plus a single-match lookup). Choosing
 * "first seen wins" or "last write wins" lets a stale scheduled/live copy
 * overwrite a verified final result, so every merge goes through the rules
 * below instead. The rules never invent data — they only pick between two
 * upstream-supplied records of the *same* fixture:
 *
 *   1. Source authority — ESPN (structured scoreboard states) outranks the
 *      WatchFooty catalogue, which outranks an unknown source. A lower-
 *      authority record can never override a higher-authority one.
 *   2. Lifecycle stage within the same authority — `finished` is later than
 *      `live`, which is later than `upcoming`. A record can therefore never
 *      move a fixture *backwards* (a stale scheduled/live copy cannot erase
 *      a final result), while genuine progression still wins.
 *   3. Live evidence — between two `live` records, the higher upstream
 *      minute wins, then the higher total goals. Clocks and scores only
 *      move forward during play, so this is a freshness proxy taken from
 *      the records themselves, never from the wall clock.
 *   4. Full tie — the incoming record wins. Call sites fold records in a
 *      deterministic fetch order (older boards first), so upstream score
 *      corrections for finished matches still propagate.
 */
import type { Match, MatchStatus } from '../types';

/** Higher = more authoritative. Unlisted/unknown sources rank lowest. */
export function sourceAuthorityRank(source: Match['source']): number {
  switch (source) {
    case 'espn':
      return 2;
    case 'watchfooty':
      return 1;
    default:
      return 0;
  }
}

/** Higher = later in the fixture lifecycle (`upcoming → live → finished`). */
export function statusStageRank(status: MatchStatus): number {
  switch (status) {
    case 'finished':
      return 2;
    case 'live':
      return 1;
    default:
      return 0;
  }
}

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

function totalGoals(match: Match): number {
  return finiteOrZero(match.homeScore) + finiteOrZero(match.awayScore);
}

/**
 * Pick the record to keep for one fixture id. `current` is the record held
 * so far, `incoming` the newly fetched one; see the module header for the
 * exact ordering. Records with different ids are returned untouched
 * (`current` kept) so a caller bug can never corrupt an unrelated fixture.
 */
export function fresherMatch<T extends Match>(current: T, incoming: T): T {
  if (!current) return incoming;
  if (!incoming || incoming.id !== current.id) return current;

  const authority = sourceAuthorityRank(incoming.source) - sourceAuthorityRank(current.source);
  if (authority !== 0) return authority > 0 ? incoming : current;

  const stage = statusStageRank(incoming.status) - statusStageRank(current.status);
  if (stage !== 0) return stage > 0 ? incoming : current;

  if (current.status === 'live') {
    const minute = finiteOrZero(incoming.currentMinuteNumber) - finiteOrZero(current.currentMinuteNumber);
    if (minute !== 0) return minute > 0 ? incoming : current;
    const goals = totalGoals(incoming) - totalGoals(current);
    if (goals !== 0) return goals > 0 ? incoming : current;
  }

  return incoming;
}

/**
 * Fold a fetch-ordered (oldest first) list into one record per fixture id,
 * preserving first-appearance order. Use whenever several boards/lists are
 * merged into a single fixture list.
 */
export function dedupeMatches(matches: Match[]): Match[] {
  const byId = new Map<string, Match>();
  for (const match of matches) {
    const existing = byId.get(match.id);
    byId.set(match.id, existing ? fresherMatch(existing, match) : match);
  }
  return [...byId.values()];
}
