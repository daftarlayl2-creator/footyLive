'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RadioTower, Search, X } from 'lucide-react';

/** Source picker with focus containment, Escape dismissal and keyboard navigation. */
export default function SourcePicker({ slot, matches, channels, slots, loading, onSelect, onClose }) {
  const [tab, setTab] = useState('channel');
  const [query, setQuery] = useState('');
  const dialog = useRef(null);
  const input = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.current.querySelectorAll('button:not(:disabled):not([tabindex="-1"]), input, a[href]')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);

  const sources = tab === 'channel'
    ? channels.map((channel) => ({ ...channel, type: 'channel', title: channel.name }))
    : matches.filter((match) => match.status === 'live').map((match) => ({ ...match, type: 'match' }));
  const filtered = sources.filter((source) => `${source.title} ${source.group || source.tournament || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="multiview-picker-heading" className="glass-dark flex max-h-[85dvh] w-full max-w-xl flex-col gap-4 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-lime-300">Screen {slot + 1}</p><h2 id="multiview-picker-heading" className="mt-1 text-lg font-black text-white">Choose a live source</h2></div>
          <button type="button" onClick={onClose} aria-label="Close source picker" className="tactile rounded-xl border border-white/10 p-2 text-zinc-300"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div role="tablist" aria-label="Source type" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'channel' : event.key === 'End' ? 'match' : tab === 'channel' ? 'match' : 'channel';
          setTab(next);
          dialog.current?.querySelector(`#source-tab-${next}`)?.focus();
        }} className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1">
          {[['channel', 'IPTV channels'], ['match', 'Live matches']].map(([key, label]) => <button key={key} id={`source-tab-${key}`} role="tab" type="button" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls="source-results" onClick={() => setTab(key)} className={`tactile rounded-xl px-3 py-2 text-xs font-extrabold ${tab === key ? 'bg-lime-400 text-navy-950' : 'text-zinc-300'}`}>{label}</button>)}
        </div>
        <label className="relative block"><span className="sr-only">Search live sources</span><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" aria-hidden="true" /><input ref={input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels, teams or competitions" className="w-full rounded-xl border border-white/15 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-lime-400/60" /></label>
        <div id="source-results" role="tabpanel" aria-labelledby={`source-tab-${tab}`} className="min-h-24 overflow-y-auto overscroll-contain">
          {loading && !sources.length ? <p role="status" className="py-8 text-center text-sm text-zinc-300">Loading live sources…</p> : filtered.length ? <ul className="space-y-2">{filtered.map((source) => {
            const alreadyAdded = slots.some((current, index) => index !== slot && current?.type === source.type && current.id === source.id);
            return <li key={`${source.type}:${source.id}`}>
              <button type="button" disabled={alreadyAdded} onClick={() => onSelect({ type: source.type, id: source.id, title: source.title, status: source.status })} className="tactile flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-lime-400/40 disabled:cursor-not-allowed disabled:opacity-40">
                <RadioTower className="h-5 w-5 shrink-0 text-lime-300" aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{source.title}</span><span className="mt-1 block text-[10px] text-zinc-400">{source.group || source.tournament || 'Live IPTV'}{source.quality ? ` · ${source.quality}` : ''} · {source.status === 'live' ? 'Live' : source.status === 'offline' ? 'Unreachable · try backup' : 'Standby · checked on opening'}</span></span>
                <span className="shrink-0 text-[11px] font-extrabold text-lime-200">{alreadyAdded ? 'Added' : 'Watch'}</span>
              </button>
            </li>;
          })}</ul> : <p role="status" className="py-8 text-center text-sm text-zinc-300">{query ? 'No sources match your search.' : tab === 'match' ? 'No live fixtures right now. Try the IPTV channels tab.' : 'No channels are available in the configured feeds.'}</p>}
        </div>
      </div>
    </div>
  );
  // Escape the main content's stacking context so the modal covers fixed
  // mobile navigation and sticky headers as well as the video tiles.
  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
