'use client';

import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export default function LiveMinute({ apiMinute, apiMinuteNumber }) {
  const [offset, setOffset] = useState(0);
  const adjusted = (apiMinuteNumber || 0) + offset;
  const display = offset === 0
    ? (apiMinute || (apiMinuteNumber ? `${apiMinuteNumber}'` : ''))
    : `${adjusted}'`;

  const isFT = adjusted >= 90;
  const isHT = adjusted === 45;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOffset(o => Math.max(o - 1, -5))}
          className="rounded-full bg-zinc-800 p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors shadow-inner"
          aria-label="Minus 1 minute"
        >
          <Minus className="h-3 w-3" />
        </button>
        
        <span className="text-[13px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-lime-950/60 border border-lime-850/80 text-lime-400 min-w-[5ch] text-center tabular-nums shadow-sm">
          {display}
        </span>
        
        <button
          onClick={() => setOffset(o => Math.min(o + 1, 10))}
          className="rounded-full bg-zinc-800 p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors shadow-inner"
          aria-label="Plus 1 minute"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {isFT || isHT ? (
          <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest bg-amber-550/10 border border-amber-500/20 px-2 py-0.5 rounded">
            {isFT ? 'FT' : 'HT'}
          </span>
        ) : (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
          </span>
        )}
      </div>
    </div>
  );
}
