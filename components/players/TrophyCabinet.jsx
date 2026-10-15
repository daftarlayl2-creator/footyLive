'use client';

import { useId, useState } from 'react';
import { Award, ChevronDown, ExternalLink, Trophy } from 'lucide-react';

/** Glass shelves with keyboard-operable filters and expandable trophy details. */
export default function TrophyCabinet({ honors = [], note }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const id = useId();
  const visible = honors.filter((honor) => filter === 'all' || honor.category === filter);
  return (
    <section className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-7" aria-labelledby={`${id}-heading`} data-trophy-cabinet="">
      <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-200/80">Legacy & silverware</p>
          <h2 id={`${id}-heading`} className="mt-1 flex items-center gap-2 text-xl font-black text-white">
            <Trophy className="h-5 w-5 text-amber-300" aria-hidden="true" /> Trophy cabinet
          </h2>
        </div>
        <div role="group" aria-label="Filter trophies" className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
          {[['all', 'All honors'], ['individual', 'Individual'], ['team', 'Team trophies']].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`tactile rounded-lg px-3 py-2 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-amber-300 ${filter === key ? 'bg-amber-300 text-navy-950' : 'text-zinc-300 hover:text-white'}`}>{label}</button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul className="relative mt-6 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((honor) => {
            const open = expanded === honor.id;
            const Icon = honor.category === 'individual' ? Award : Trophy;
            return (
              <li key={honor.id} className="overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.02] shadow-[0_12px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl">
                <button type="button" aria-expanded={open} aria-controls={`${id}-${honor.id}`} onClick={() => setExpanded(open ? null : honor.id)} className="tactile group flex w-full flex-col items-center gap-3 px-4 py-6 text-center focus-visible:outline-2 focus-visible:outline-amber-300">
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-200/20 bg-gradient-to-b from-amber-300/20 to-amber-800/10 shadow-[0_8px_30px_rgba(251,191,36,0.12)] transition-transform group-hover:-translate-y-1 motion-reduce:transform-none">
                    <Icon className="h-10 w-10 text-amber-200 drop-shadow-[0_3px_10px_rgba(251,191,36,0.4)]" strokeWidth={1.3} aria-hidden="true" />
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-300">{honor.category === 'individual' ? 'Individual honor' : 'Team trophy'}</span>
                  <span className="text-sm font-extrabold text-white">{honor.name}</span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-amber-100">{honor.years.length > 1 ? `${honor.years.length} selected wins` : honor.years[0]}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /></span>
                </button>
                <div id={`${id}-${honor.id}`} hidden={!open} className="border-t border-white/15 bg-black/20 px-4 py-3 text-center text-xs text-zinc-200">
                  <p className="font-bold">{honor.years.join(' · ')}</p>
                  {honor.source && <a href={honor.source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-amber-200 underline underline-offset-4">Honor source<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}
                </div>
                <div className="h-1 border-t border-white/20 bg-white/10 shadow-[0_5px_15px_rgba(255,255,255,0.1)]" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      ) : <p role="status" className="relative mt-6 rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-300">{honors.length ? 'No honors in this category.' : 'Verified honors are not available for this player yet. Missing data does not mean no trophies.'}</p>}
      <p className="relative mt-5 text-[11px] leading-relaxed text-zinc-400">{note || 'Only honors supplied by the data provider are displayed.'} Select a trophy to see its seasons and source.</p>
    </section>
  );
}
