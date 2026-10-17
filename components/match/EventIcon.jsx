import { ArrowLeftRight, CircleDot, Minus, Target, XCircle } from 'lucide-react';
import { EVENT_ICON_LABELS, eventIconKey } from '@/lib/match/eventIcons';

/**
 * Renders the canonical icon for a match event (Phase 11). Cards render as
 * the same coloured chips the scoreboard uses; everything else is a lucide
 * glyph with an accessible label. Unknown events get a neutral dash.
 */
export default function EventIcon({ event, className = 'h-4 w-4' }) {
  const key = eventIconKey(event);
  const label = EVENT_ICON_LABELS[key];

  if (key === 'yellow-card' || key === 'red-card') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        data-event-icon={key}
        className={`inline-block h-3.5 w-2.5 rounded-[2px] ${key === 'yellow-card' ? 'bg-yellow-400' : 'bg-red-500'}`}
      />
    );
  }

  const Glyph = {
    goal: CircleDot,
    'own-goal': CircleDot,
    'penalty-goal': Target,
    'penalty-award': Target,
    'penalty-missed': XCircle,
    substitution: ArrowLeftRight,
    other: Minus,
  }[key] || Minus;

  const tone = {
    goal: 'text-lime-500',
    'own-goal': 'text-red-400',
    'penalty-goal': 'text-lime-500',
    'penalty-award': 'text-amber-400',
    'penalty-missed': 'text-zinc-400',
    substitution: 'text-sky-400',
    other: 'text-zinc-500',
  }[key] || 'text-zinc-500';

  return (
    <span role="img" aria-label={label} title={label} data-event-icon={key} className="inline-flex shrink-0">
      <Glyph className={`${className} ${tone}`} aria-hidden="true" />
    </span>
  );
}
