'use client';

import { useState } from 'react';
import Link from 'next/link';
import { matchHref as canonicalMatchHref } from '@/lib/seo/matches';
import { CalendarDays, ChevronDown, History, Landmark, Shirt, Users } from 'lucide-react';
import ClubLink from '@/components/clubs/ClubLink';
import TeamLogo from '@/components/clubs/TeamLogo';
import CrestDrop from '@/components/clubs/CrestDrop';
import FormStrip from '@/components/club/FormStrip';
import LocalDateTime from '@/components/ui/LocalDateTime';
import { playerHref } from '@/lib/players/normalize';

const RESULT_STYLES = {
  W: 'border-lime-500/40 bg-lime-500/15 text-lime-800 dark:text-lime-300',
  D: 'border-zinc-400/40 bg-zinc-400/15 text-zinc-700 dark:text-zinc-300',
  L: 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
};

function matchHref(match) {
  return canonicalMatchHref({ id: `espn-${match.id}`, homeTeam: match.home, awayTeam: match.away, tournament: match.competition, timestamp: Date.parse(match.date || '') });
}

function Venue({ match }) {
  return (
    <span className="rounded-md border border-navy-200 px-1.5 py-0.5 text-[10px] font-black text-navy-600 dark:border-navy-750 dark:text-zinc-400">
      {match.isHome ? 'H' : 'A'}
    </span>
  );
}

function EmptyTab({ icon: Icon, title, children }) {
  return (
    <div className="app-card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-500 dark:bg-navy-950 dark:text-zinc-400">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-extrabold text-navy-800 dark:text-zinc-200">{title}</p>
      {children && <p className="max-w-sm text-xs text-navy-500 dark:text-zinc-400">{children}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Results                                                                    */
/* -------------------------------------------------------------------------- */

function ResultRow({ match }) {
  const ours = match.isHome ? match.home : match.away;
  const theirs = match.opponent;
  const shootout =
    ours.shootout !== undefined && theirs.shootout !== undefined ? ` (${ours.shootout}–${theirs.shootout} pens)` : '';
  return (
    <li className="flex items-center gap-3 border-t border-navy-100 px-4 py-3 first:border-t-0 dark:border-navy-750/70">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-500 dark:text-zinc-400">
          <LocalDateTime iso={match.date} variant="date" />
          <span aria-hidden="true">·</span>
          <span className="truncate">{match.competition}</span>
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <Venue match={match} />
          <ClubLink team={theirs} className="tactile-soft flex min-w-0 items-center gap-2 rounded-lg font-bold text-navy-900 hover:text-lime-700 dark:text-zinc-100 dark:hover:text-lime-400">
            <TeamLogo src={theirs.logo} name={theirs.name} size={22} />
            <span className="truncate text-sm">
              <span className="text-[11px] font-semibold text-navy-400 dark:text-zinc-400">{match.isHome ? 'vs ' : '@ '}</span>
              {theirs.name}
            </span>
          </ClubLink>
        </div>
      </div>
      <Link
        href={matchHref(match)}
        title="Open match centre"
        className={`tactile flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm font-black tabular-nums ${RESULT_STYLES[match.result] || RESULT_STYLES.D}`}
      >
        <span>
          {ours.score ?? '–'}–{theirs.score ?? '–'}
          {shootout && <span className="sr-only">{shootout}</span>}
        </span>
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/60 text-[10px] dark:bg-black/25">{match.result}</span>
      </Link>
    </li>
  );
}

function ResultsTab({ results, form }) {
  const [expanded, setExpanded] = useState(false);
  if (!results.length) {
    return <EmptyTab icon={History} title="No results yet">Completed matches from this season will appear here.</EmptyTab>;
  }
  const last5 = results.slice(0, 5);
  const tally = last5.reduce((acc, m) => ({ ...acc, [m.result]: (acc[m.result] || 0) + 1 }), {});
  const points = (tally.W || 0) * 3 + (tally.D || 0);
  const visible = expanded ? results : results.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="app-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-navy-500 dark:text-zinc-400">Recent form</p>
          <p className="mt-1 text-sm font-bold text-navy-800 dark:text-zinc-200">
            {tally.W || 0}W · {tally.D || 0}D · {tally.L || 0}L <span className="text-navy-500 dark:text-zinc-400">· {points} pts from last {last5.length}</span>
          </p>
        </div>
        <FormStrip form={form} size="lg" className="[&>li:last-child]:ring-lime-500/60" />
      </div>

      <div className="app-card overflow-hidden">
        <ol>
          {visible.map((match) => (
            <ResultRow key={match.id} match={match} />
          ))}
        </ol>
        {results.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="tactile flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-navy-100 py-3 text-xs font-extrabold text-navy-600 hover:text-lime-700 dark:border-navy-750/70 dark:text-zinc-300 dark:hover:text-lime-400"
          >
            {expanded ? 'Show fewer' : `Show all ${results.length} results`}
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function NextMatchCard({ match }) {
  return (
    <Link href={matchHref(match)} className="app-card tactile-soft group relative block overflow-hidden p-5">
      <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-lime-500/15 blur-3xl" />
      <div className="relative flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em]">
        <span className="text-lime-700 dark:text-lime-400">{match.status === 'live' ? '● Live now' : 'Next match'}</span>
        <span className="truncate text-navy-500 dark:text-zinc-400">{match.competition}</span>
      </div>
      <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[match.home, null, match.away].map((side, index) =>
          side ? (
            <div key={index} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <CrestDrop src={side.logo} name={side.name} size={58} />
              <span className="w-full truncate text-sm font-extrabold text-navy-900 dark:text-white">{side.name}</span>
            </div>
          ) : (
            <div key={index} className="flex flex-col items-center gap-1 text-center">
              <span className="text-[11px] font-black uppercase text-navy-500 dark:text-zinc-400">vs</span>
              <LocalDateTime iso={match.date} variant="time" className="text-lg font-black tabular-nums text-navy-900 dark:text-white" />
              <LocalDateTime iso={match.date} variant="date" className="text-[11px] font-bold text-navy-500 dark:text-zinc-400" />
            </div>
          )
        )}
      </div>
      {match.venue && (
        <p className="relative mt-4 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-navy-500 dark:text-zinc-400">
          <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
          {match.venue}
          {match.city ? `, ${match.city}` : ''}
        </p>
      )}
    </Link>
  );
}

function FixtureRow({ match }) {
  const theirs = match.opponent;
  return (
    <li className="flex items-center gap-3 border-t border-navy-100 px-4 py-3 first:border-t-0 dark:border-navy-750/70">
      <div className="w-16 shrink-0 text-center">
        <LocalDateTime iso={match.date} variant="date" className="block text-[11px] font-extrabold text-navy-700 dark:text-zinc-300" />
        <LocalDateTime iso={match.date} variant="time" className="block text-[11px] font-semibold tabular-nums text-navy-500 dark:text-zinc-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-navy-500 dark:text-zinc-400">
          {match.competition}
          {match.status === 'postponed' && <span className="ml-1 font-extrabold text-amber-600 dark:text-amber-400">· Postponed</span>}
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <Venue match={match} />
          <ClubLink team={theirs} className="tactile-soft flex min-w-0 items-center gap-2 rounded-lg font-bold text-navy-900 hover:text-lime-700 dark:text-zinc-100 dark:hover:text-lime-400">
            <TeamLogo src={theirs.logo} name={theirs.name} size={22} />
            <span className="truncate text-sm">{theirs.name}</span>
          </ClubLink>
        </div>
      </div>
      <Link
        href={matchHref(match)}
        className="tactile shrink-0 rounded-xl border border-navy-200 px-2.5 py-1.5 text-[11px] font-extrabold text-navy-600 hover:border-lime-500/50 hover:text-lime-700 dark:border-navy-750 dark:text-zinc-300 dark:hover:text-lime-400"
      >
        Preview
      </Link>
    </li>
  );
}

function FixturesTab({ fixtures }) {
  if (!fixtures.length) {
    return <EmptyTab icon={CalendarDays} title="No upcoming fixtures">The next fixtures will appear as soon as they are scheduled.</EmptyTab>;
  }
  const [next, ...rest] = fixtures;
  return (
    <div className="space-y-4">
      <NextMatchCard match={next} />
      {rest.length > 0 && (
        <div className="app-card overflow-hidden">
          <ol>
            {rest.slice(0, 12).map((match) => (
              <FixtureRow key={match.id} match={match} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Squad                                                                      */
/* -------------------------------------------------------------------------- */

function PlayerCard({ player, accent, club }) {
  const stats = [
    player.appearances !== undefined ? `${player.appearances} apps` : null,
    player.goals ? `${player.goals} G` : null,
    player.assists ? `${player.assists} A` : null,
  ].filter(Boolean);
  return (
    <li>
      <Link href={playerHref(player.id, { clubId: club?.espnId, league: club?.league?.slug })} prefetch={false} aria-label={`Open ${player.name} player profile`} className="tactile flex h-full items-center gap-3 rounded-2xl border border-navy-100 bg-white px-3 py-2.5 outline-none transition-colors hover:border-lime-500/50 focus-visible:ring-2 focus-visible:ring-lime-500 dark:border-navy-750/70 dark:bg-navy-950/50 dark:hover:border-lime-500/50">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-sm"
        style={{ background: accent }}
        aria-label={player.jersey ? `Shirt number ${player.jersey}` : undefined}
      >
        {player.jersey || <Shirt className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-navy-900 dark:text-white">
          <span className="truncate">{player.name}</span>
          {player.injured && (
            <span className="shrink-0 rounded bg-red-500/15 px-1 text-[9px] font-black uppercase text-red-600 dark:text-red-400" title="Injured">
              Inj
            </span>
          )}
        </p>
        <p className="truncate text-[11px] font-semibold text-navy-500 dark:text-zinc-400">
          {[player.position, player.age ? `${player.age} yrs` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {player.flag && <img src={player.flag} alt={player.nationality || ''} title={player.nationality} loading="lazy" className="h-3.5 w-5 rounded-[3px] object-cover shadow-sm" />}
        {stats.length > 0 && <span className="text-[10px] font-bold tabular-nums text-navy-500 dark:text-zinc-400">{stats.join(' · ')}</span>}
      </div>
      </Link>
    </li>
  );
}

function SquadTab({ squad, accent, club }) {
  if (!squad.length) {
    return <EmptyTab icon={Users} title="Squad list unavailable">ESPN hasn&apos;t published a squad list for this club yet.</EmptyTab>;
  }
  return (
    <div className="space-y-5">
      {squad.map(({ group, players }) => (
        <section key={group} aria-label={group}>
          <h3 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-navy-500 dark:text-zinc-400">
            {group}
            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] text-navy-600 dark:bg-navy-900 dark:text-zinc-400">{players.length}</span>
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} accent={accent} club={club} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Club page tabs: Recent Form & Results | Upcoming Fixtures | Current Squad.
 * `squad` arrives pre-grouped by position; `accent` is the hero colour.
 */
export default function ClubTabs({ results = [], fixtures = [], squad = [], form = [], accent = '#572339', club }) {
  const [tab, setTab] = useState('results');
  const squadCount = squad.reduce((sum, g) => sum + g.players.length, 0);
  const tabs = [
    { key: 'results', label: 'Form & Results', icon: History, count: results.length },
    { key: 'fixtures', label: 'Fixtures', icon: CalendarDays, count: fixtures.length },
    { key: 'squad', label: 'Squad', icon: Users, count: squadCount },
  ];
  const index = Math.max(0, tabs.findIndex((t) => t.key === tab));

  return (
    <div className="space-y-4">
      <div className="sticky-below-header z-30 -mx-4 bg-navy-50/85 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-3xl sm:border sm:border-navy-200/70 sm:px-3 dark:bg-navy-950/85 dark:sm:border-navy-750">
        <div role="tablist" aria-label="Club sections" className="relative grid grid-cols-3 rounded-2xl bg-navy-100 p-1 dark:bg-navy-900">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-xl bg-white shadow-app transition-transform duration-300 ease-spring dark:bg-navy-750"
            style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${index * 100}%)` }}
          />
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`club-tab-${item.key}`}
                aria-selected={active}
                aria-controls={`club-panel-${item.key}`}
                onClick={() => setTab(item.key)}
                className={`tactile relative z-10 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-[12px] font-extrabold sm:text-xs ${
                  active ? 'text-navy-900 dark:text-white' : 'text-navy-500 hover:text-navy-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className={`hidden h-3.5 w-3.5 min-[400px]:block ${active ? 'text-lime-600 dark:text-lime-400' : ''}`} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {item.count > 0 && (
                  <span className={`hidden rounded-full px-1.5 text-[10px] tabular-nums sm:inline ${active ? 'bg-lime-500 text-navy-950' : 'bg-navy-200/70 dark:bg-navy-800'}`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div key={tab} id={`club-panel-${tab}`} role="tabpanel" aria-labelledby={`club-tab-${tab}`} className="animate-slide-up">
        {tab === 'results' && <ResultsTab results={results} form={form} />}
        {tab === 'fixtures' && <FixturesTab fixtures={fixtures} />}
        {tab === 'squad' && <SquadTab squad={squad} accent={accent} club={club} />}
      </div>
    </div>
  );
}
