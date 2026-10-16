'use client';

import Link from 'next/link';
import { CheckCircle2, Clock3, Flame, Loader2, MessageCircle, Sparkles, Star, Target, XCircle } from 'lucide-react';
import ClubLink from '@/components/clubs/ClubLink';
import CrestDrop from '@/components/clubs/CrestDrop';
import useCountUp from '@/lib/hooks/useCountUp';

const RING_RADIUS = 34;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function AccuracyRing({ value }) {
  // The ring eases its arc and its percentage counts up together.
  const pct = useCountUp(value ?? 0, 700);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg
        viewBox="0 0 80 80"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={value === null ? 'Prediction accuracy: no settled predictions yet' : `Prediction accuracy ${value}%`}
      >
        <circle cx="40" cy="40" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={RING_RADIUS}
          fill="none"
          stroke="#CCFF00"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - pct / 100)}
          className="drop-shadow-[0_0_6px_rgba(198,255,0,0.45)] transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-2xl font-black tabular-nums text-white">{value === null ? '—' : `${pct}%`}</span>
        <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-zinc-300">Accuracy</span>
      </span>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, detail, accent = 'text-lime-300' }) {
  const counted = useCountUp(value);
  return (
    <div className="glass-dark-tile glass-dark-tile-hover min-w-0 rounded-2xl p-3 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none">
      <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-300">
        <Icon className={`h-3.5 w-3.5 ${accent}`} aria-hidden="true" />
        {label}
      </span>
      <p className="mt-1 text-2xl font-black tabular-nums text-white">{counted}</p>
      {detail && <p className="truncate text-[11px] font-semibold text-zinc-300">{detail}</p>}
    </div>
  );
}

function pickLabel(row) {
  if (row.prediction === 'draw') return 'Draw';
  const team = row.prediction === 'home' ? row.result?.homeName : row.result?.awayName;
  if (team) return `${team} to win`;
  return row.prediction === 'home' ? 'Home win' : 'Away win';
}

function matchLabel(row) {
  const r = row.result;
  if (!r?.homeName || !r?.awayName) return 'Match details loading…';
  const score = Number.isFinite(r.homeScore) && Number.isFinite(r.awayScore) ? ` ${r.homeScore}–${r.awayScore} ` : ' vs ';
  return `${r.homeName}${score}${r.awayName}`;
}

const OUTCOME = {
  correct: { icon: CheckCircle2, text: 'Correct', className: 'border-lime-500/35 bg-lime-500/10 text-lime-200' },
  wrong: { icon: XCircle, text: 'Missed', className: 'border-red-500/35 bg-red-500/10 text-red-200' },
  pending: { icon: Clock3, text: 'Pending', className: 'border-white/10 bg-white/5 text-zinc-200' },
};

/**
 * Fan Stats: prediction accuracy (correct calls over settled votes), streaks,
 * recent calls, starred teams and chat activity — all from this device.
 */
export default function FanStatsCard({ stats }) {
  const { predictions, chat, favorites, level, syncing } = stats;
  const pointsToNext = level.nextAt === null ? null : level.nextAt - level.points;

  return (
    <section className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-labelledby="fan-stats-heading" data-fan-stats="">
      <span className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-lime-500/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fan-stats-heading" className="flex items-center gap-2 text-base font-extrabold text-white">
            <Sparkles className="h-4 w-4 text-lime-300" aria-hidden="true" />
            Fan Stats
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">Predictions, starred teams and chat activity on this device</p>
        </div>
        <div className="min-w-[10rem] text-right">
          <p className="text-xs font-extrabold text-lime-200">
            Lv {level.level} · {level.title}
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5" aria-hidden="true">
            <span className="block h-full rounded-full bg-gradient-to-r from-lime-500 to-lime-300" style={{ width: `${level.progress}%` }} />
          </div>
          <p className="mt-1 text-[10px] font-semibold text-zinc-300">
            {level.points} pts{pointsToNext !== null ? ` · ${pointsToNext} to next level` : ' · top level'}
          </p>
        </div>
      </div>

      {/* Prediction accuracy */}
      <div className="relative mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <AccuracyRing value={predictions.accuracy} />
        <div className="grid w-full flex-1 grid-cols-2 gap-2.5">
          <StatTile
            icon={Target}
            label="Correct calls"
            value={predictions.correct}
            detail={predictions.settled ? `of ${predictions.settled} settled` : 'No settled calls yet'}
          />
          <StatTile
            icon={Flame}
            label="Streak"
            value={predictions.currentStreak}
            detail={`Best ${predictions.bestStreak}`}
            accent="text-amber-300"
          />
          <StatTile
            icon={Clock3}
            label="Pending"
            value={predictions.pending}
            detail={syncing ? 'Checking results…' : 'Awaiting full time'}
            accent="text-sky-300"
          />
          <StatTile icon={CheckCircle2} label="Total votes" value={predictions.total} detail="Who will win? calls" />
        </div>
      </div>

      {/* Recent calls */}
      <div className="relative mt-5">
        <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-200">
          Recent predictions
          {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin text-lime-300" aria-label="Checking results" />}
        </h3>
        {predictions.recent.length ? (
          <ul className="mt-2 space-y-2">
            {predictions.recent.map((row) => {
              const outcome = OUTCOME[row.outcome] || OUTCOME.pending;
              const Icon = outcome.icon;
              return (
                <li key={row.matchId}>
                  <Link
                    href={`/watch/${encodeURIComponent(row.matchId)}`}
                    className="glass-dark-tile glass-dark-tile-hover tactile-soft flex items-center gap-3 rounded-2xl px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{pickLabel(row)}</p>
                      <p className="truncate text-[11px] font-semibold text-zinc-300">{matchLabel(row)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${outcome.className}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {row.outcome === 'pending' && row.result?.status === 'live' ? 'Live' : outcome.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-zinc-300">
            No predictions yet. Open a match and tap <span className="font-bold text-white">Who will win?</span> to start your record.
          </p>
        )}
      </div>

      {/* Starred teams + chat */}
      <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
        <div className="glass-dark-tile rounded-2xl p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-300">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            Starred teams
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-white">{favorites.length}</p>
          {favorites.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {favorites.slice(0, 8).map((team) => (
                <ClubLink key={team.name} team={team} prefetch={false} aria-label={`Open ${team.name} club profile`} className="tactile rounded-full">
                  <CrestDrop src={team.badge} name={team.name} size="sm" tone="dark" />
                </ClubLink>
              ))}
              {favorites.length > 8 && <span className="self-center text-xs font-bold text-zinc-300">+{favorites.length - 8}</span>}
            </div>
          ) : (
            <p className="mt-1 text-[11px] font-semibold text-zinc-300">Star teams on match cards to follow them.</p>
          )}
        </div>
        <div className="glass-dark-tile rounded-2xl p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-300">
            <MessageCircle className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
            Chat activity
          </span>
          <p className="mt-1 text-2xl font-black tabular-nums text-white">
            {chat.messages} <span className="text-sm font-bold text-zinc-300">{chat.messages === 1 ? 'message' : 'messages'}</span>
          </p>
          <p className="text-[11px] font-semibold text-zinc-300">
            {chat.matches.length} {chat.matches.length === 1 ? 'match' : 'matches'} · {chat.reactions} {chat.reactions === 1 ? 'reaction' : 'reactions'}
          </p>
        </div>
      </div>
    </section>
  );
}
