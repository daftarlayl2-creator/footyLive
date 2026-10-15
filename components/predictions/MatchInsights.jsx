'use client';

import useSWR from 'swr';
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';

const fetchInsights = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Insights temporarily unavailable');
  return response.json();
};
const colors = { home: 'bg-lime-500', draw: 'bg-zinc-300', away: 'bg-sky-400' };

/** Read-only model estimates, deliberately separate from the fan-voting widget. */
export function MatchInsightsContent({ data, homeTeam, awayTeam }) {
  const options = [
    { key: 'home', name: homeTeam?.name || 'Home', label: 'Home win' },
    { key: 'draw', name: 'Draw', label: 'Draw' },
    { key: 'away', name: awayTeam?.name || 'Away', label: 'Away win' },
  ];
  const pct = data.probabilities;
  return (
    <>
      {pct ? (
        <>
          <div role="img" aria-label={`Win probability: ${options[0].name} ${pct.home}%, Draw ${pct.draw}%, ${options[2].name} ${pct.away}%`} className="mt-5 flex h-5 overflow-hidden rounded-full bg-black/35 shadow-inner ring-1 ring-white/5">
            {options.map(({ key }) => <span key={key} style={{ width: `${pct[key]}%` }} className={`${colors[key]} h-full transition-[width] duration-700 motion-reduce:transition-none`} />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {options.map(({ key, name, label }) => <div key={key} className="tactile-soft glass-dark-tile min-w-0 rounded-2xl p-2.5"><span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-300"><span className={`h-2 w-2 shrink-0 rounded-full ${colors[key]}`} />{label}</span><p className="mt-1 truncate text-xs font-bold text-zinc-100" title={name}>{name}</p><p className="mt-1 text-2xl font-black tabular-nums text-white">{pct[key]}%</p></div>)}
          </div>
        </>
      ) : <p role="status" className="mt-4 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-zinc-300">Not enough history to estimate win probabilities. No results or standings have been invented.</p>}
      <h3 className="mt-5 flex items-center gap-1.5 text-xs font-extrabold text-white"><Sparkles className="h-3.5 w-3.5 text-lime-300" aria-hidden="true" /> AI Quick Insights</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {data.insights.map((insight) => <li key={insight} className="glass-dark-tile flex gap-2 rounded-2xl p-3 text-xs leading-relaxed text-zinc-100"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />{insight}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        {Object.entries(data.coverage).map(([key, available]) => <span key={key} className={`rounded-full border px-2 py-1 ${available ? 'border-lime-500/25 bg-lime-500/10 text-lime-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}>{key === 'h2h' ? 'H2H' : key === 'form' ? 'Recent form' : 'Standing points'}: {available ? 'included' : 'unavailable'}</span>)}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-zinc-400">Lightweight statistical model, not a trained AI or betting advice. Recent form (55%), current league points (30%) and available H2H (15%); missing factors are excluded and weights rebalanced. Pre-match history estimate, not live-score odds. Limited to the provider’s available history.</p>
    </>
  );
}

export default function MatchInsights({ matchId, homeTeam, awayTeam }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/match/${encodeURIComponent(matchId)}/insights`, fetchInsights, {
    revalidateOnFocus: false, refreshInterval: 300000, dedupingInterval: 60000, shouldRetryOnError: false,
  });
  return (
    <section aria-label="H2H & AI Win Probability" className="glass-dark relative overflow-hidden rounded-3xl p-4 sm:p-5">
      <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-lime-500/10 blur-3xl" />
      <div className="relative flex items-center gap-2.5"><span className="rounded-2xl bg-lime-500/15 p-2.5 text-lime-300"><BrainCircuit className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="text-sm font-extrabold text-white">H2H &amp; AI Win Probability</h2><p className="text-[11px] text-zinc-300">Match insights · separate from fan votes</p></div></div>
      {isLoading && <div role="status" className="mt-4 space-y-3"><div className="h-5 animate-pulse rounded-full bg-lime-500/15 motion-reduce:animate-none" /><p className="text-xs text-zinc-300">Analysing recent form, meetings and standings…</p></div>}
      {error && !data && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-300"><p>Insights are temporarily unavailable. Scores and streams are unaffected.</p><button type="button" onClick={() => mutate()} className="tactile glass-dark-tile glass-dark-tile-hover inline-flex items-center gap-1 rounded-xl px-3 py-2 text-zinc-100"><RefreshCw className="h-3 w-3" /> Retry insights</button></div>}
      {data && <MatchInsightsContent data={data} homeTeam={homeTeam} awayTeam={awayTeam} />}
    </section>
  );
}
