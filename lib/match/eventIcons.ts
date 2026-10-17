import type { MatchEvent } from '@/lib/types';

/**
 * Canonical event → icon mapping (Phase 11).
 *
 * Keys come from the typed event vocabulary produced upstream
 * (`classifyEspnEventType` in lib/providers/espn.ts, which is ordered so
 * "Own Goal"/"Penalty - Scored" win before the generic "goal" substring).
 * The two penalty moments fans confuse are deliberately distinct:
 * a penalty GOAL (`penalty-goal`) vs a penalty merely AWARDED
 * (`penalty-award`, still to be taken) vs MISSED/SAVED (`penalty-missed`).
 * Anything unrecognised maps to the neutral `other` key — never a guess.
 *
 * A structured ESPN `type.id` table is intentionally NOT hardcoded: our
 * verified fixtures carry `type.text` without ids, and inventing id numbers
 * would risk silently misclassifying real events. When id-bearing payloads
 * are captured, they can pre-empt the text path inside the classifier and
 * this mapping stays unchanged.
 */
export type EventIconKey =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'penalty-award'
  | 'penalty-missed'
  | 'yellow-card'
  | 'red-card'
  | 'substitution'
  | 'other';

export const EVENT_ICON_LABELS: Record<EventIconKey, string> = {
  goal: 'Goal',
  'own-goal': 'Own goal',
  'penalty-goal': 'Penalty goal',
  'penalty-award': 'Penalty awarded',
  'penalty-missed': 'Penalty missed',
  'yellow-card': 'Yellow card',
  'red-card': 'Red card',
  substitution: 'Substitution',
  other: 'Match event',
};

type IconEvent = Pick<MatchEvent, 'type' | 'label' | 'penalty' | 'ownGoal'> | null | undefined;

export function eventIconKey(event: IconEvent): EventIconKey {
  if (!event) return 'other';
  const label = String(event.label || '').toLowerCase();

  switch (event.type) {
    case 'goal':
      return event.ownGoal ? 'own-goal' : event.penalty ? 'penalty-goal' : 'goal';
    case 'own-goal':
      return 'own-goal';
    case 'penalty':
      // The typed vocabulary uses 'penalty' only for a scored penalty.
      return 'penalty-goal';
    case 'yellow':
      return 'yellow-card';
    case 'red':
      return 'red-card';
    case 'substitution':
      return 'substitution';
    default:
      break;
  }

  // 'other' rows can still be penalty moments that are not goals; the label
  // disambiguates without ever upgrading them to a scored penalty.
  if (label.includes('penalty')) {
    if (label.includes('miss') || label.includes('saved')) return 'penalty-missed';
    if (label.includes('award') || label.includes('won')) return 'penalty-award';
  }
  return 'other';
}

export function eventIconLabel(event: IconEvent): string {
  return EVENT_ICON_LABELS[eventIconKey(event)];
}
