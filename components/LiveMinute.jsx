'use client';

import { useState } from 'react';
import { Plus, Minus, Radio } from 'lucide-react';

/**
 * Live match minute with DVR controls (−1 / +1 minute, jump to live) that
 * drive the player through `eviv:dvr` window events. `compact` folds the
 * status into the LIVE button (used by the scoreboard's centre column).
 */
export default function LiveMinute({ apiMinute, apiMinuteNumber, compact = false }) {
  const [dvrState, setDvrState] = useState({ baseMinute: apiMinuteNumber, offset: 0 });
  const offset = dvrState.baseMinute === apiMinuteNumber ? dvrState.offset : 0;
  const adjusted = (apiMinuteNumber || 0) + offset;
  const display = offset === 0
    ? (apiMinute || (apiMinuteNumber ? `${apiMinuteNumber}'` : ''))
    : `${adjusted}'`;

  const isLive = offset === 0;

  const rewind = () => {
    setDvrState((prev) => {
      const current = prev.baseMinute === apiMinuteNumber ? prev.offset : 0;
      return { baseMinute: apiMinuteNumber, offset: Math.max(current - 1, -30) };
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr', { detail: { deltaMinutes: -1 } }));
    }
  };

  const forward = () => {
    setDvrState((prev) => {
      const current = prev.baseMinute === apiMinuteNumber ? prev.offset : 0;
      return { baseMinute: apiMinuteNumber, offset: Math.min(current + 1, 10) };
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr', { detail: { deltaMinutes: 1 } }));
    }
  };

  const goLive = () => {
    setDvrState({ baseMinute: apiMinuteNumber, offset: 0 });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eviv:dvr-live'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`flex items-center ${compact ? 'gap-1.5 sm:gap-2' : 'gap-2'}`}>
        <button
          type="button"
          onClick={rewind}
          className="rounded-full border border-white/10 bg-white/5 p-1 text-zinc-300 hover:border-lime-500/40 hover:text-white transition-colors shadow-inner"
          aria-label="Minus 1 minute"
        >
          <Minus className="h-3 w-3" />
        </button>

        <span
          className={`font-bold font-mono rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-300 min-w-[5ch] text-center tabular-nums shadow-sm ${
            compact ? 'px-2 py-0.5 text-base sm:px-3 sm:py-1 sm:text-xl' : 'text-[13px] px-2.5 py-0.5'
          }`}
          aria-live="off"
        >
          {display}
        </span>

        <button
          type="button"
          onClick={forward}
          className="rounded-full border border-white/10 bg-white/5 p-1 text-zinc-300 hover:border-lime-500/40 hover:text-white transition-colors shadow-inner"
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
            : 'bg-navy-900 border border-lime-500/40 text-lime-300 hover:bg-lime-500/10'
        }`}
        aria-label="Jump to live"
      >
        <Radio className="h-2.5 w-2.5" />
        {compact && !isLive ? `WATCHING ${adjusted}'` : 'LIVE'}
      </button>

      {!compact && (
        <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded ${
          isLive
            ? 'text-lime-300 bg-lime-500/10 border border-lime-500/25'
            : 'text-amber-300 bg-amber-500/10 border border-amber-500/20'
        }`}>
          {isLive ? `LIVE: ${apiMinuteNumber || 0}'` : `WATCHING: ${adjusted}'`}
        </span>
      )}
    </div>
  );
}
