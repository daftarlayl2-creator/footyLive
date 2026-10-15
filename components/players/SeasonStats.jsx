import { Activity, Clock3, Crosshair, Footprints, Target } from 'lucide-react';

const STATS = [
  { key: 'appearances', label: 'Appearances', short: 'Apps', icon: Activity },
  { key: 'goals', label: 'Goals', short: 'G', icon: Target },
  { key: 'assists', label: 'Assists', short: 'A', icon: Footprints },
  { key: 'minutes', label: 'Minutes played', short: 'Min', icon: Clock3 },
  { key: 'passAccuracy', label: 'Pass accuracy', short: '%', icon: Crosshair },
];

export default function SeasonStats({ season }) {
  return (
    <section aria-labelledby="player-season-heading" className="space-y-4" data-player-season="">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <h2 id="player-season-heading" className="text-lg font-extrabold text-navy-900 dark:text-white">{season.current ? 'Current season performance' : 'Season performance'}</h2>
        <p className="text-xs font-semibold text-navy-500 dark:text-zinc-400">{season.label}{season.scope ? ` · ${season.scope}` : ''}{!season.current && season.label !== 'Season not reported' ? ' · Last reported season' : ''}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map(({ key, label, short, icon: Icon }) => {
          const value = season[key];
          return (
            <div key={key} className="app-card relative overflow-hidden p-5" data-player-stat={key}>
              <Icon className="h-5 w-5 text-lime-600 dark:text-lime-400" aria-hidden="true" />
              <dt className="mt-4 text-[11px] font-bold text-navy-500 dark:text-zinc-400">{label} <span className="text-[9px] opacity-70">({short})</span></dt>
              <dd className="mt-1 text-3xl font-black tabular-nums text-navy-900 dark:text-white">{value === undefined ? <><span aria-hidden="true">—</span><span className="sr-only">Not reported</span></> : `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)}${key === 'passAccuracy' ? '%' : ''}`}</dd>
            </div>
          );
        })}
      </dl>
      <p className="px-1 text-[11px] text-navy-500 dark:text-zinc-400">Statistics reflect the reported competition and season, not career totals. A dash means the provider has not supplied that statistic.</p>
    </section>
  );
}
