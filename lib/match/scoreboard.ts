/**
 * Pure helpers for scoreboards and match cards.
 *
 *  - Scorers are grouped per player and anchored to the side they scored for:
 *    "Alphadjo Cissè 15', 32'" sits under AC Milan, never under the opponent.
 *    Structured goals (`MatchGoal[]`) are preferred; the legacy
 *    "Player 63'" strings are parsed when that is all the feed provides.
 *  - `describePeriod()` turns ESPN status text and minutes into short labels
 *    ("1st half", "Half-time", "Extra time", "Full time").
 *
 * Isomorphic and side-effect free.
 */

import type { MatchGoal } from '../types';

export type Side = 'home' | 'away';

export interface GoalMark {
  minute: string;
  penalty: boolean;
  ownGoal: boolean;
}

export interface ScorerGroup {
  /** Scorer name ('' when the feed did not name one). */
  player: string;
  goals: GoalMark[];
}

export interface ParsedScorer extends GoalMark {
  player: string;
}

type GoalLike = { player?: string | null; minute?: string | null; penalty?: boolean; ownGoal?: boolean };

const PRIME = `['’′]`;
const MINUTE_AT_END = new RegExp(`(\\d{1,3})${PRIME}?(?:\\s*\\+\\s*(\\d{1,2})${PRIME}?)?$`);
const PENALTY_MARK = /\s*\((?:p|pen|pen\.|penalty)\)\s*$/i;
const OWN_GOAL_MARK = /\s*\((?:og|o\.g\.|own goal)\)\s*$/i;

/** Normalises "45+2", "45' + 2'" and "45’+2’" to ESPN's "45'+2'". */
export function normalizeMinute(minute: string | null | undefined): string {
  const raw = String(minute ?? '').trim();
  const match = MINUTE_AT_END.exec(raw);
  if (!match || match.index !== 0) return raw;
  return `${Number(match[1])}'${match[2] ? `+${Number(match[2])}'` : ''}`;
}

/** Sort key for a minute: "45'+2'" → 45.02, missing minutes sort last. */
export function minuteValue(minute: string | null | undefined): number {
  const match = MINUTE_AT_END.exec(String(minute ?? '').trim());
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) + (match[2] ? Number(match[2]) / 100 : 0);
}

/**
 * Parses one legacy scorer string: "Bukayo Saka 20'", "Salah 45'+2' (P)",
 * "Doe 40' (OG)", a bare "63'" or the placeholder "Goal".
 */
export function parseScorerLine(line: string | null | undefined): ParsedScorer {
  let text = String(line ?? '').replace(/\s+/g, ' ').trim();
  let penalty = false;
  let ownGoal = false;
  // Markers may come in any order after the minute.
  for (let i = 0; i < 2; i++) {
    if (PENALTY_MARK.test(text)) {
      penalty = true;
      text = text.replace(PENALTY_MARK, '');
    }
    if (OWN_GOAL_MARK.test(text)) {
      ownGoal = true;
      text = text.replace(OWN_GOAL_MARK, '');
    }
  }
  const match = MINUTE_AT_END.exec(text);
  let player = text;
  let minute = '';
  // Only a separate trailing token counts as a minute (not digits inside a name).
  if (match && (match.index === 0 || text[match.index - 1] === ' ')) {
    minute = normalizeMinute(match[0]);
    player = text.slice(0, match.index).trim();
  }
  if (/^goal$/i.test(player)) player = '';
  return { player, minute, penalty, ownGoal };
}

function playerKey(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/**
 * Groups goals per scorer: one entry per player with every minute, players
 * ordered by their first goal and minutes in match order.
 */
export function groupGoals(goals: GoalLike[] | null | undefined): ScorerGroup[] {
  const groups = new Map<string, ScorerGroup>();
  for (const goal of goals ?? []) {
    if (!goal) continue;
    const player = String(goal.player ?? '').replace(/\s+/g, ' ').trim();
    const key = playerKey(player);
    let group = groups.get(key);
    if (!group) {
      group = { player, goals: [] };
      groups.set(key, group);
    }
    group.goals.push({ minute: normalizeMinute(goal.minute), penalty: Boolean(goal.penalty), ownGoal: Boolean(goal.ownGoal) });
  }
  const list = [...groups.values()];
  for (const group of list) group.goals.sort((a, b) => minuteValue(a.minute) - minuteValue(b.minute));
  return list.sort((a, b) => minuteValue(a.goals[0]?.minute) - minuteValue(b.goals[0]?.minute));
}

/**
 * Grouped scorers per side. Structured `goals` win (they carry penalty /
 * own-goal flags); otherwise the legacy per-side strings are parsed.
 */
export function scorersBySide(input: {
  goals?: MatchGoal[] | null;
  scorers?: { home?: string[] | null; away?: string[] | null } | null;
}): Record<Side, ScorerGroup[]> {
  const goals = Array.isArray(input?.goals) ? input.goals : null;
  if (goals && goals.length) {
    return {
      home: groupGoals(goals.filter((g) => g?.side === 'home')),
      away: groupGoals(goals.filter((g) => g?.side === 'away')),
    };
  }
  return {
    home: groupGoals((input?.scorers?.home ?? []).map(parseScorerLine)),
    away: groupGoals((input?.scorers?.away ?? []).map(parseScorerLine)),
  };
}

/** "32'" / "32' (P)" / "40' (OG)". */
export function formatGoalMark(mark: GoalMark): string {
  const minute = mark.minute || '?';
  return `${minute}${mark.penalty ? ' (P)' : ''}${mark.ownGoal ? ' (OG)' : ''}`;
}

/** "15', 32' (P)". */
export function formatGoalMinutes(goals: GoalMark[]): string {
  return goals.map(formatGoalMark).join(', ');
}

/** "Alphadjo Cissè 15', 32'" (unnamed scorers read "Goal 63'"). */
export function formatScorerLine(group: ScorerGroup): string {
  return `${group.player || 'Goal'} ${formatGoalMinutes(group.goals)}`;
}

export interface PeriodInput {
  status?: string | null;
  /** ESPN `status.type.description`, e.g. "Second Half", "Halftime". */
  period?: string | null;
  /** Display minute, e.g. "63'", "HT", "90'+4'". */
  currentMinute?: string | null;
  currentMinuteNumber?: number | null;
}

/** Short period label for the scoreboard's centre badge. */
export function describePeriod({ status, period, currentMinute, currentMinuteNumber }: PeriodInput): string {
  const text = String(period ?? '').toLowerCase();
  const minute = String(currentMinute ?? '').trim().toUpperCase();

  if (status === 'finished') {
    if (/penalt|shoot|\bpens\b/.test(text)) return 'After penalties';
    if (/extra|aet|overtime/.test(text)) return 'After extra time';
    return 'Full time';
  }
  if (status !== 'live') return status === 'upcoming' ? 'Kick-off' : '';

  if (minute === 'HT' || /half\s*-?\s*time|halftime/.test(text)) return 'Half-time';
  if (/penalt|shoot|\bpens\b/.test(text)) return 'Penalties';
  if (/end of (regular|normal)|end of 90/.test(text)) return 'End of 90 min';
  if (/extra|overtime/.test(text) || minute === 'ET') return 'Extra time';
  if (/first half|1st half/.test(text)) return '1st half';
  if (/second half|2nd half/.test(text)) return '2nd half';

  const n = Number(currentMinuteNumber) || Number.parseInt(minute, 10) || 0;
  if (n > 90) return 'Extra time';
  if (n > 45) return '2nd half';
  if (n > 0) return '1st half';
  return 'Live';
}

/** Centre-badge clock: "63'", "HT", "FT" or '' before kick-off. */
export function clockLabel({ status, currentMinute, currentMinuteNumber }: PeriodInput): string {
  if (status === 'finished') return 'FT';
  if (status !== 'live') return '';
  const minute = String(currentMinute ?? '').trim();
  if (minute) return minute;
  return currentMinuteNumber ? `${currentMinuteNumber}'` : 'LIVE';
}
