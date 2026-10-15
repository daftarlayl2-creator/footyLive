'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Grid2X2, Layers, Plus, RefreshCw, Replace, VolumeX, X } from 'lucide-react';
import MultiStreamSlot from '@/components/multiview/MultiStreamSlot';
import SourcePicker from '@/components/multiview/SourcePicker';

const EMPTY_SLOTS = [null, null, null, null];

export default function MultiStreamPage() {
  const [slots, setSlots] = useState(EMPTY_SLOTS);
  const [sizes, setSizes] = useState([50, 50, 50, 50]);
  const [matches, setMatches] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [activeSlot, setActiveSlot] = useState(null);
  const arena = useRef(null);
  const catalogRequest = useRef(null);
  const stopResize = useRef(null);

  const refreshCatalog = useCallback(async () => {
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    const get = async (url, key) => {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data[key])) throw new Error('Catalog unavailable');
      return data[key];
    };
    const results = await Promise.allSettled([get('/api/matches', 'matches'), get('/api/live-channels?probe=0', 'channels')]);
    if (controller.signal.aborted) return;
    if (results[0].status === 'fulfilled') setMatches(results[0].value);
    if (results[1].status === 'fulfilled') {
      setChannels(results[1].value);
      const params = new URLSearchParams(window.location.search);
      const id = params.get('channel');
      const requested = results[1].value.find((channel) => channel.id === id);
      if (requested) {
        setSlots((current) => current.some(Boolean) ? current : [{ type: 'channel', id, title: requested.name, status: requested.status }, null, null, null]);
        params.delete('channel');
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
      }
    }
    setCatalogError(results.some((result) => result.status === 'rejected') ? 'Some live sources could not be refreshed. Playing screens have not been interrupted.' : '');
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = setTimeout(refreshCatalog, 0);
    const timer = setInterval(() => { if (!document.hidden) void refreshCatalog(); }, 20_000);
    return () => { clearTimeout(initial); clearInterval(timer); catalogRequest.current?.abort(); stopResize.current?.(); };
  }, [refreshCatalog]);

  const setSize = (index, value) => setSizes((current) => current.map((size, i) => i === index ? Math.max(25, Math.min(100, value)) : size));
  const startResize = (event, index) => {
    event.preventDefault();
    stopResize.current?.();
    const startX = event.clientX;
    const startSize = sizes[index];
    const width = arena.current?.clientWidth || 1200;
    const move = (next) => setSize(index, Math.round(startSize + (next.clientX - startX) / width * 100));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      stopResize.current = null;
    };
    stopResize.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  const selectSource = (source) => {
    if (!Number.isInteger(activeSlot) || activeSlot < 0 || activeSlot >= 4) return;
    setSlots((current) => current.map((slot, index) => index === activeSlot ? source : slot));
    setActiveSlot(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="glass-panel flex flex-col justify-between gap-4 rounded-3xl p-5 sm:p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-700 dark:text-lime-300">Your matchday, multiplied</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-navy-900 dark:text-white"><Layers className="h-5 w-5 text-lime-600 dark:text-lime-400" aria-hidden="true" />Multi-View Broadcast Arena</h1>
          <p className="mt-2 text-xs leading-relaxed text-navy-500 dark:text-zinc-400">Watch up to 4 live matches or IPTV channels. Each screen checks source health, selects its best stream and switches to a healthy backup automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto rounded-full bg-lime-500/10 px-3 py-1.5 text-xs font-black text-lime-700 dark:text-lime-300" role="status">{slots.filter(Boolean).length} / 4 screens</span>
          <button type="button" onClick={() => setSizes([50, 50, 50, 50])} className="tactile inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-3 py-2 text-xs font-bold dark:border-white/15"><Grid2X2 className="h-3.5 w-3.5" aria-hidden="true" />Quad layout</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event('eviv:multiview-mute'))} className="tactile inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-3 py-2 text-xs font-bold dark:border-white/15"><VolumeX className="h-3.5 w-3.5" aria-hidden="true" />Mute all</button>
          <button type="button" onClick={refreshCatalog} className="tactile inline-flex items-center gap-1.5 rounded-xl border border-navy-200 px-3 py-2 text-xs font-bold dark:border-white/15"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh sources</button>
          <button type="button" onClick={() => setSlots([null, null, null, null])} className="tactile rounded-xl border border-navy-200 px-3 py-2 text-xs font-bold dark:border-white/15">Clear Arena</button>
        </div>
      </header>
      {catalogError && <p role="alert" className="app-card border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-200">{catalogError}</p>}
      <div ref={arena} className="flex flex-wrap items-start gap-4" data-multiview-arena="">
        {slots.map((source, index) => (
          <section key={index} aria-label={`Screen ${index + 1}`} data-multiview-slot={index + 1} style={{ flex: `1 1 calc(${sizes[index]}% - 8px)`, minWidth: 'min(100%, 290px)', maxWidth: '100%' }} className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-navy-950 shadow-xl">
            <div className="flex min-w-0 items-center gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
              <span className="rounded-lg bg-lime-400/15 px-2 py-1 text-[10px] font-black text-lime-200">{index + 1}</span>
              {source ? <Link href={`/${source.type === 'channel' ? 'channel' : 'watch'}/${encodeURIComponent(source.id)}`} className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-200 hover:text-lime-200">{source.title}</Link> : <h2 className="min-w-0 flex-1 text-xs font-bold text-zinc-400">Empty screen</h2>}
              <button type="button" onClick={() => setActiveSlot(index)} aria-label={`${source ? 'Replace' : 'Choose'} source for screen ${index + 1}`} className="tactile rounded-lg p-1.5 text-zinc-300 hover:bg-white/10"><Replace className="h-4 w-4" aria-hidden="true" /></button>
              {source && <button type="button" onClick={() => setSlots((current) => current.map((slot, i) => i === index ? null : slot))} aria-label={`Remove screen ${index + 1}`} className="tactile rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-200"><X className="h-4 w-4" aria-hidden="true" /></button>}
            </div>
            {source ? <MultiStreamSlot key={`${source.type}:${source.id}`} source={source} /> : <button type="button" onClick={() => setActiveSlot(index)} className="tactile flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-zinc-300 hover:bg-white/5"><Plus className="h-9 w-9 rounded-xl border border-dashed border-white/20 p-2 text-lime-300" aria-hidden="true" /><span className="text-sm font-bold">Add live stream</span><span className="text-[11px] text-zinc-400">Choose a match or an IPTV channel</span></button>}
            <label className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-[10px] font-bold text-zinc-400">Width {sizes[index]}%<input type="range" min="25" max="100" step="5" value={sizes[index]} aria-label={`Screen ${index + 1} width`} onChange={(event) => setSize(index, Number(event.target.value))} className="h-1 min-w-0 flex-1 accent-lime-400" /></label>
            <div role="separator" aria-orientation="vertical" onPointerDown={(event) => startResize(event, index)} className="absolute bottom-10 right-0 top-12 w-2 cursor-col-resize touch-none hover:bg-lime-400/20" title="Drag to resize screen" />
          </section>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-navy-500 dark:text-zinc-400">Direct IPTV streams start muted; use each player’s volume control to listen. Embedded providers manage their own audio. Probes measure server-side reachability and startup latency, not your connection speed. Four high-resolution streams may use significant bandwidth.</p>
      {activeSlot !== null && <SourcePicker slot={activeSlot} matches={matches} channels={channels} slots={slots} loading={loading} onSelect={selectSource} onClose={() => setActiveSlot(null)} />}
    </div>
  );
}
