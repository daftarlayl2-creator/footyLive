'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { AlertTriangle, Footprints, Goal, Info, RefreshCw, Table2, Trophy } from 'lucide-react';
import ClubLink from '@/components/clubs/ClubLink';
import TeamLogo from '@/components/clubs/TeamLogo';
import { standingsLegend } from '@/lib/standings';

export const STANDINGS_VIEWS = [
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'scorers', label: 'Top Scorers', icon: Goal },
  { key: 'assists', label: 'Top Assists', icon: Footprints },
];

export function standingsApiUrl(slug) {
  return `/api/standings?league=${encodeURIComponent(slug)}`;
}

async function fetchStandings(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Standings are temporarily unavailable.');
  return json;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

/* -------------------------------------------------------------------------- */
/*  Table                                                                      */
/* -------------------------------------------------------------------------- */

const FORM_STYLES = {
  W: 'bg-lime-500 text-navy-950',
  D: 'bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100',
  L: 'bg-red-500 text-white',
};

function FormPills({ form }) {
  if (!form) return null;
  return (
    <span className="inline-flex gap-0.5">
      {form.slice(-5).split('').map((result, index) => (
        <span key={index} className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${FORM_STYLES[result] || ''}`}>
          {result}
        </span>
      ))}
    </span>
  );
}

const HEAD = 'px-1.5 py-2.5 text-center text-[10.5px] font-extrabold uppercase tracking-wider text-navy-500 dark:text-zinc-400';
const CELL = 'px-1.5 text-center tabular-nums text-navy-700 dark:text-zinc-300';
const STICKY_BG = 'bg-white dark:bg-[#290815]';

export function StandingsTable({ group, showForm }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[340px] border-separate border-spacing-0 text-[12.5px] sm:text-sm">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 z-10 w-10 pl-3 ${STICKY_BG}`}>
              Pos
            </th>
            <th scope="col" className={`${HEAD} sticky left-10 z-10 text-left ${STICKY_BG}`}>
              Team
            </th>
            <th scope="col" className={HEAD} title="Played">P</th>
            <th scope="col" className={HEAD} title="Won">W</th>
            <th scope="col" className={HEAD} title="Drawn">D</th>
            <th scope="col" className={HEAD} title="Lost">L</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`} title="Goals for">GF</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`} title="Goals against">GA</th>
            <th scope="col" className={`${HEAD} sm:hidden`} title="Goals for : against">G</th>
            <th scope="col" className={HEAD} title="Goal difference">GD</th>
            <th scope="col" className={`${HEAD} pr-3 text-navy-900 dark:text-white`} title="Points">Pts</th>
            {showForm && <th scope="col" className={`${HEAD} hidden pr-3 md:table-cell`}>Form</th>}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={`${row.position}-${row.team.id || row.team.name}`} className="group/row h-12 transition-colors hover:bg-lime-500/[0.06]">
              <td
                className={`sticky left-0 z-10 border-t border-navy-100 pl-3 pr-1 text-center font-extrabold tabular-nums dark:border-navy-750/70 ${STICKY_BG} group-hover/row:bg-[#f7fde6] dark:group-hover/row:bg-[#2d0d17]`}
                style={row.zone ? { boxShadow: `inset 3px 0 0 ${row.zone.color}` } : undefined}
                title={row.zone?.label}
              >
                <span className={row.position <= 3 ? 'text-lime-700 dark:text-lime-400' : 'text-navy-700 dark:text-zinc-300'}>{row.position}</span>
              </td>
              <td className={`sticky left-10 z-10 max-w-[150px] border-t border-navy-100 pr-2 sm:max-w-none dark:border-navy-750/70 ${STICKY_BG} group-hover/row:bg-[#f7fde6] dark:group-hover/row:bg-[#2d0d17]`}>
                <ClubLink team={row.team} className="tactile-soft flex min-w-0 items-center gap-2.5 rounded-lg py-1 font-bold text-navy-900 hover:text-lime-700 dark:text-zinc-100 dark:hover:text-lime-400">
                  <TeamLogo src={row.team.logo} name={row.team.name} size={24} />
                  <span className="truncate sm:hidden">{row.team.shortName || row.team.name}</span>
                  <span className="hidden truncate sm:inline">{row.team.name}</span>
                </ClubLink>
              </td>
              <td className={`${CELL} border-t border-navy-100 dark:border-navy-750/70`}>{row.played}</td>
              <td className={`${CELL} border-t border-navy-100 dark:border-navy-750/70`}>{row.won}</td>
              <td className={`${CELL} border-t border-navy-100 dark:border-navy-750/70`}>{row.drawn}</td>
              <td className={`${CELL} border-t border-navy-100 dark:border-navy-750/70`}>{row.lost}</td>
              <td className={`${CELL} hidden border-t border-navy-100 sm:table-cell dark:border-navy-750/70`}>{row.goalsFor}</td>
              <td className={`${CELL} hidden border-t border-navy-100 sm:table-cell dark:border-navy-750/70`}>{row.goalsAgainst}</td>
              <td className={`${CELL} border-t border-navy-100 whitespace-nowrap sm:hidden dark:border-navy-750/70`}>
                {row.goalsFor}:{row.goalsAgainst}
              </td>
              <td
                className={`${CELL} border-t border-navy-100 font-semibold dark:border-navy-750/70 ${
                  row.goalDifference > 0 ? 'text-lime-700 dark:text-lime-400' : row.goalDifference < 0 ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {signed(row.goalDifference)}
              </td>
              <td className="border-t border-navy-100 px-1.5 pr-3 text-center text-[14px] font-black tabular-nums text-navy-900 dark:border-navy-750/70 dark:text-white">
                {row.points}
              </td>
              {showForm && (
                <td className="hidden border-t border-navy-100 px-1.5 pr-3 md:table-cell dark:border-navy-750/70">
                  <FormPills form={row.form} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Leaders                                                                    */
/* -------------------------------------------------------------------------- */

const MEDALS = [
  'bg-gradient-to-br from-amber-300 to-amber-500 text-navy-950 shadow-[0_6px_16px_-6px_rgba(245,158,11,0.8)]',
  'bg-gradient-to-br from-zinc-200 to-zinc-400 text-navy-950',
  'bg-gradient-to-br from-orange-300 to-orange-600 text-white',
];

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);
  // Headshots 404 for many players; catch failures that happened before hydration too.
  const imageRef = useCallback(
    (node) => {
      if (node && node.complete && node.naturalWidth === 0) markFailed();
    },
    [markFailed]
  );
  const initials = player.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (!player.id || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-100 text-xs font-black text-navy-700 dark:bg-navy-950 dark:text-zinc-300">
        {initials}
      </span>
    );
  }
  return (
    <img
      src={`https://a.espncdn.com/i/headshots/soccer/players/full/${player.id}.png`}
      alt=""
      loading="lazy"
      decoding="async"
      ref={imageRef}
      onError={markFailed}
      className="h-10 w-10 shrink-0 rounded-2xl bg-navy-100 object-cover object-top dark:bg-navy-950"
    />
  );
}

export function LeadersList({ rows, metric }) {
  const metricLabel = metric === 'goals' ? 'Goals' : 'Assists';
  return (
    <div className="app-card overflow-hidden">
      <div className="hidden grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5rem] items-center gap-3 border-b border-navy-100 px-4 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-navy-500 md:grid dark:border-navy-750 dark:text-zinc-400">
        <span className="text-center">Rank</span>
        <span>Player</span>
        <span>Club</span>
        <span className="text-right">{metricLabel}</span>
      </div>
      <ol>
        {rows.map((row, index) => (
          <li
            key={`${row.player.id || row.player.name}-${index}`}
            className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-navy-100 px-3 py-3 first:border-t-0 md:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5rem] md:px-4 dark:border-navy-750/70 ${
              row.rank === 1 ? 'bg-gradient-to-r from-lime-500/[0.08] to-transparent' : ''
            }`}
          >
            <span
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black tabular-nums ${
                row.rank <= 3 ? MEDALS[row.rank - 1] : 'bg-navy-100 text-navy-700 dark:bg-navy-950 dark:text-zinc-300'
              }`}
            >
              {row.rank}
            </span>

            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar player={row.player} />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-navy-900 dark:text-white">{row.player.name}</p>
                {/* Club shown under the name on phones */}
                <ClubLink team={row.team} className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-navy-500 hover:text-lime-700 md:hidden dark:text-zinc-400 dark:hover:text-lime-400">
                  <TeamLogo src={row.team.logo} name={row.team.name} size={16} />
                  <span className="truncate">{row.team.name}</span>
                </ClubLink>
                <p className="hidden text-[11px] font-semibold text-navy-500 md:block dark:text-zinc-400">
                  {[row.player.jersey ? `#${row.player.jersey}` : null, row.appearances !== undefined ? `${row.appearances} apps` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            <ClubLink team={row.team} className="hidden min-w-0 items-center gap-2 text-sm font-bold text-navy-700 hover:text-lime-700 md:flex dark:text-zinc-300 dark:hover:text-lime-400">
              <TeamLogo src={row.team.logo} name={row.team.name} size={22} />
              <span className="truncate">{row.team.name}</span>
            </ClubLink>

            <div className="text-right">
              <p className="text-xl font-black leading-none tabular-nums text-navy-900 dark:text-white">{row.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-zinc-400">
                {metricLabel}
                {row.appearances !== undefined && <span className="md:hidden"> · {row.appearances} apps</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  States                                                                     */
/* -------------------------------------------------------------------------- */

function SkeletonRows({ count = 10 }) {
  return (
    <div className="app-card space-y-0 overflow-hidden" aria-busy="true" aria-label="Loading standings">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 border-t border-navy-100 px-4 first:border-t-0 dark:border-navy-750/70">
          <span className="skeleton h-4 w-5 rounded-md" />
          <span className="skeleton h-6 w-6 rounded-full" />
          <span className="skeleton h-4 flex-1 rounded-md" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
          <span className="skeleton h-4 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon = Info, title, children }) {
  return (
    <div className="app-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-100 text-navy-500 dark:bg-navy-950 dark:text-zinc-400">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-extrabold text-navy-800 dark:text-zinc-200">{title}</p>
      {children && <p className="max-w-sm text-xs leading-relaxed text-navy-500 dark:text-zinc-400">{children}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  View                                                                       */
/* -------------------------------------------------------------------------- */

export default function StandingsView({ leagues, initialLeague, initialView = 'table', initialData = null }) {
  const [league, setLeague] = useState(initialLeague);
  const [view, setView] = useState(initialView);
  const pillsRef = useRef(null);

  const { data, error, isValidating, mutate } = useSWR(standingsApiUrl(league), fetchStandings, {
    fallbackData: league === initialLeague && initialData ? initialData : undefined,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshInterval: 5 * 60 * 1000,
    dedupingInterval: 60 * 1000,
  });

  const meta = leagues.find((l) => l.slug === league) || leagues[0];

  // Keep the active league pill centred in its scroller (horizontal only).
  useEffect(() => {
    const scroller = pillsRef.current;
    const pill = scroller?.querySelector('[aria-selected="true"]');
    if (!scroller || !pill) return;
    const left = pill.offsetLeft - scroller.clientWidth / 2 + pill.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [league]);

  const syncUrl = (nextLeague, nextView) => {
    const params = new URLSearchParams(window.location.search);
    params.set('league', nextLeague);
    if (nextView === 'table') params.delete('view');
    else params.set('view', nextView);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectLeague = (slug) => {
    if (slug === league) return;
    setLeague(slug);
    syncUrl(slug, view);
  };

  const selectView = (key) => {
    setView(key);
    syncUrl(league, key);
  };

  const viewIndex = Math.max(0, STANDINGS_VIEWS.findIndex((v) => v.key === view));
  const legend = data?.groups ? standingsLegend(data.groups) : [];
  const showForm = Boolean(data?.groups?.some((g) => g.rows.some((r) => r.form)));

  let content;
  if (!data && error) {
    content = (
      <div className="app-card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-extrabold text-navy-800 dark:text-zinc-200">Couldn&apos;t load {meta.name}</p>
        <p className="max-w-sm text-xs text-navy-500 dark:text-zinc-400">{error.message}</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="tactile mt-1 inline-flex items-center gap-2 rounded-2xl bg-lime-500 px-4 py-2 text-xs font-extrabold text-navy-950 shadow-glow-lime"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  } else if (!data) {
    content = <SkeletonRows count={view === 'table' ? 12 : 8} />;
  } else if (view === 'table') {
    content = data.groups?.length ? (
      <div className="space-y-5">
        {data.groups.map((group, index) => (
          <section key={group.name || index} className="app-card overflow-hidden" aria-label={group.name || `${meta.name} table`}>
            {group.name && (
              <h2 className="border-b border-navy-100 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-navy-700 dark:border-navy-750 dark:text-zinc-300">
                {group.name}
              </h2>
            )}
            <StandingsTable group={group} showForm={showForm} />
          </section>
        ))}
        {(legend.length > 0 || data.partial) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] font-semibold text-navy-600 dark:text-zinc-400">
            {legend.map((zone) => (
              <span key={zone.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: zone.color }} />
                {zone.label}
              </span>
            ))}
          </div>
        )}
        {data.partial && (
          <p className="flex items-start gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 text-[11.5px] font-semibold text-navy-700 dark:text-zinc-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />
            Showing the top {data.groups[0]?.rows.length} clubs — the full {meta.name} table isn&apos;t available from our free data
            source yet.
          </p>
        )}
      </div>
    ) : (
      <EmptyState icon={Table2} title="No table published yet">
        {meta.name} hasn&apos;t published standings for this season yet. Check back after the first matchday.
      </EmptyState>
    );
  } else {
    const rows = view === 'scorers' ? data.scorers : data.assists;
    content = !data.leadersAvailable ? (
      <EmptyState icon={view === 'scorers' ? Goal : Footprints} title={`${view === 'scorers' ? 'Top scorers' : 'Top assists'} unavailable`}>
        Player leaderboards for {meta.name} aren&apos;t offered by our data sources yet — the league table is available.
      </EmptyState>
    ) : rows?.length ? (
      <LeadersList rows={rows} metric={view === 'scorers' ? 'goals' : 'assists'} />
    ) : (
      <EmptyState icon={view === 'scorers' ? Goal : Footprints} title="No numbers yet">
        Leaderboards appear once the season&apos;s first goals are scored.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero */}
      <header className="app-card relative overflow-hidden p-5 sm:p-6">
        <span className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-500/10 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-navy-500/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-app ring-1 ring-navy-100 dark:bg-navy-950 dark:ring-navy-750">
            {data?.league?.logo ? (
              <TeamLogo key={data.league.logo} src={data.league.logo} name={meta.name} size={40} rounded="rounded-lg" priority />
            ) : (
              <Trophy className="h-7 w-7 text-lime-600 dark:text-lime-400" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-lime-700 dark:text-lime-400">
              Standings · {meta.country}
            </p>
            <h1 className="truncate text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl dark:text-white">{meta.name}</h1>
            <p className="mt-0.5 text-xs font-semibold text-navy-500 dark:text-zinc-400">
              {data?.season ? `Season ${data.season} · ` : ''}Official table, top scorers &amp; assists
            </p>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Refresh standings"
            title="Refresh"
            className="tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-navy-200 bg-white text-navy-600 hover:border-lime-500/50 hover:text-lime-700 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-300 dark:hover:text-lime-400"
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Sticky controls: league pills + category tabs */}
      <div className="sticky-below-header z-30 -mx-4 space-y-2.5 bg-navy-50/85 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-3xl sm:border sm:border-navy-200/70 sm:px-3 dark:bg-navy-950/85 dark:sm:border-navy-750">
        <div
          ref={pillsRef}
          role="tablist"
          aria-label="League"
          className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 py-0.5"
        >
          {leagues.map((item) => {
            const active = item.slug === league;
            return (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectLeague(item.slug)}
                onPointerEnter={() => preload(standingsApiUrl(item.slug), fetchStandings)}
                onFocus={() => preload(standingsApiUrl(item.slug), fetchStandings)}
                className={`tactile shrink-0 snap-start cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 text-xs font-extrabold ${
                  active
                    ? 'border-lime-400 bg-lime-500 text-navy-950 shadow-glow-lime'
                    : 'border-navy-200 bg-white text-navy-700 hover:border-lime-500/50 hover:text-navy-900 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-300 dark:hover:text-white'
                }`}
              >
                {item.shortName}
              </button>
            );
          })}
        </div>

        <div role="tablist" aria-label="Category" className="relative grid grid-cols-3 rounded-2xl bg-navy-100 p-1 dark:bg-navy-900">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-xl bg-white shadow-app transition-transform duration-300 ease-spring dark:bg-navy-750"
            style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${viewIndex * 100}%)` }}
          />
          {STANDINGS_VIEWS.map((item) => {
            const Icon = item.icon;
            const active = item.key === view;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectView(item.key)}
                className={`tactile relative z-10 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-extrabold sm:text-xs ${
                  active ? 'text-navy-900 dark:text-white' : 'text-navy-500 hover:text-navy-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-lime-600 dark:text-lime-400' : ''}`} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={`${league}-${view}`} className="animate-slide-up" role="tabpanel">
        {content}
      </div>

      {data && (
        <p className="px-1 text-center text-[10.5px] font-semibold text-navy-400 dark:text-zinc-400">
          Data: {data.source === 'thesportsdb' ? 'TheSportsDB' : 'ESPN'} · refreshed automatically every few minutes
        </p>
      )}
    </div>
  );
}
