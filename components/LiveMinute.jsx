'use client';

import { useState, useEffect } from 'react';
import { Plus, Minus, Radio } from 'lucide-react';

export default function LiveMinute({ apiMinute, apiMinuteNumber }) {
  const [offset, setOffset] = useState(0);
  const adjusted = (apiMinuteNumber || 0) + offset;
  const display = offset === 0
    ? (apiMinute || (apiMinuteNumber ? `${apiMinuteNumber}'` : ''))
    : `${adjusted}'`;

  const isLive = offset === 0;

  const rewind = () => {
    setOffset((o) => Math.max(o - 1, -30));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr', { detail: { deltaMinutes: -1 } }));
    }
  };

  const forward = () => {
    setOffset((o) => Math.min(o + 1, 10));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr', { detail: { deltaMinutes: 1 } }));
    }
  };

  const goLive = () => {
    setOffset(0);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr-live'));
    }
  };

  useEffect(() => {
    // Reset offset when the upstream minute changes.
    setOffset(0);
  }, [apiMinuteNumber]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={rewind}
          className="rounded-full bg-navy-900 p-1 text-zinc-500 hover:bg-navy-750 hover:text-zinc-200 transition-colors shadow-inner"
          aria-label="Minus 1 minute"
        >
          <Minus className="h-3 w-3" />
        </button>

        <span className="text-[13px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 min-w-[5ch] text-center tabular-nums shadow-sm">
          {display}
        </span>

        <button
          onClick={forward}
          className="rounded-full bg-navy-900 p-1 text-zinc-500 hover:bg-navy-750 hover:text-zinc-200 transition-colors shadow-inner"
          aria-label="Plus 1 minute"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <button
        type="button"
        onClick={goLive}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest transition-all ${
          isLive
            ? 'bg-lime-500 text-navy-950 shadow-[0_0_12px_rgba(198,255,0,0.5)] animate-pulse'
            : 'bg-navy-900 border border-lime-500/40 text-lime-400 hover:bg-lime-500/10'
        }`}
        aria-label="Jump to live"
      >
        <Radio className="h-2.5 w-2.5" />
        LIVE
      </button>

      <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded ${
        isLive
          ? 'text-lime-400 bg-lime-500/10 border border-lime-500/25'
          : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
      }`}>
        {isLive ? `LIVE: ${apiMinuteNumber || 0}'` : `WATCHING: ${adjusted}'`}
      </span>
    </div>
  );
}
