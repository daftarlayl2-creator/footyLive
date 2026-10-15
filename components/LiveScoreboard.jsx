'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import LiveMinute from './LiveMinute';

// The scoreboard shares the same burgundy/lime identity as the rest of EVIV.
const THEME = {
  glow1: 'bg-lime-500/10',
  glow2: 'bg-navy-700/20',
  border: 'border-navy-750',
  shadow: 'shadow-[0_0_50px_rgba(198,255,0,0.10)]',
  accent: 'text-lime-400',
  ring: 'ring-lime-500/35 border-lime-500/25',
};

function CardChips({ cards }) {
  if (!cards) return null;
  const rows = [
    { label: 'yellow', count: cards.yellow || 0, className: 'bg-amber-400' },
    { label: 'red', count: cards.red || 0, className: 'bg-red-500' },
  ].filter((row) => row.count > 0);
  if (!rows.length) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {rows.flatMap((row) =>
        Array.from({ length: Math.min(row.count, 3) }).map((_, i) => (
          <span key={`${row.label}-${i}`} className={`h-3 w-2 rounded-[2px] ${row.className}`} />
        ))
      )}
    </span>
  );
}

export default function LiveScoreboard({ matchId, initial }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const t = THEME;
  const isFinished = data.status === 'finished';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/match/${matchId}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.match) setData((prev) => ({ ...prev, ...json.match }));
    } catch (e) {
      // Silent catch — the next poll retries.
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (data.status !== 'live') return;
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [data.status, refresh]);

  const homeScorers = data.scorers?.home || [];
  const awayScorers = data.scorers?.away || [];

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-navy-900 px-6 py-6 shadow-2xl transition-all duration-500 ${t.border} ${t.shadow}`}>
      {/* Dynamic glow backgrounds */}
      <div className={`absolute top-0 left-1/4 w-[250px] h-[250px] pointer-events-none filter blur-3xl transition-all duration-500 ${t.glow1}`} />
      <div className={`absolute bottom-0 right-1/4 w-[250px] h-[250px] pointer-events-none filter blur-3xl transition-all duration-500 ${t.glow2}`} />

      <div className="absolute top-3.5 right-4 z-20 rounded-full border border-navy-750 bg-navy-950/80 px-2 py-1 shadow-lg backdrop-blur-md">
        <button
          onClick={refresh}
          className="text-lime-400 transition-colors hover:text-lime-300"
          title="Refresh live data"
          aria-label="Refresh live data"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 mt-2">

        {/* Home Team */}
        <div className="flex flex-col items-center gap-3 min-w-0 flex-1 md:items-end">
          <div className="flex flex-col items-center md:items-end gap-2.5">
            {data.homeBadge ? (
              <img
                src={data.homeBadge}
                alt=""
                className={`h-16 w-16 rounded-full object-contain bg-navy-900 p-1.5 ring-2 shadow-lg transition-all duration-500 ${t.ring}`}
              />
            ) : (
              <div className={`h-16 w-16 rounded-full bg-navy-900 border flex items-center justify-center text-zinc-650 text-xl font-bold transition-all duration-500 ${t.border}`}>
                {data.homeName?.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-base font-extrabold text-white text-center md:text-right truncate max-w-[200px]">{data.homeName}</span>
            <span className="flex items-center gap-1.5">
              <CardChips cards={data.cards?.home} />
            </span>
          </div>
        </div>

        {/* Score Center Board */}
        <div className={`flex items-center gap-6 shrink-0 bg-navy-900/60 border rounded-2xl px-6 py-4 shadow-inner transition-all duration-500 ${t.border}`}>
          <span className="text-4xl sm:text-5xl font-black tabular-nums text-white tracking-tighter">{data.homeScore}</span>

          <div className="flex flex-col items-center">
            <span className="text-zinc-650 text-[10px] font-bold uppercase tracking-widest mb-1.5">
              {isFinished ? 'Result' : 'Minute'}
            </span>
            {isFinished ? (
              <span className="text-[13px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-navy-950 border border-navy-750 text-zinc-300">
                FT
              </span>
            ) : (
              <LiveMinute apiMinute={data.currentMinute} apiMinuteNumber={data.currentMinuteNumber} />
            )}
          </div>

          <span className="text-4xl sm:text-5xl font-black tabular-nums text-white tracking-tighter">{data.awayScore}</span>
        </div>

        {/* Away Team */}
        <div className="flex flex-col items-center gap-3 min-w-0 flex-1 md:items-start">
          <div className="flex flex-col items-center md:items-start gap-2.5">
            {data.awayBadge ? (
              <img
                src={data.awayBadge}
                alt=""
                className={`h-16 w-16 rounded-full object-contain bg-navy-900 p-1.5 ring-2 shadow-lg transition-all duration-500 ${t.ring}`}
              />
            ) : (
              <div className={`h-16 w-16 rounded-full bg-navy-900 border flex items-center justify-center text-zinc-650 text-xl font-bold transition-all duration-500 ${t.border}`}>
                {data.awayName?.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-base font-extrabold text-white text-center md:text-left truncate max-w-[200px]">{data.awayName}</span>
            <span className="flex items-center gap-1.5">
              <CardChips cards={data.cards?.away} />
            </span>
          </div>
        </div>

      </div>

      {/* Real-time scorers strip */}
      {(homeScorers.length > 0 || awayScorers.length > 0) && (
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 text-[11px] font-semibold">
          <div className="space-y-1 text-center md:text-right">
            {homeScorers.map((scorer, idx) => (
              <p key={`h${idx}`} className={`text-zinc-300 ${t.accent}`}>⚽ {scorer}</p>
            ))}
          </div>
          <div className="space-y-1 text-center md:text-left">
            {awayScorers.map((scorer, idx) => (
              <p key={`a${idx}`} className="text-zinc-300">⚽ {scorer}</p>
            ))}
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className={`relative z-10 mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-semibold text-zinc-500 border-t pt-4 transition-all duration-500 ${t.border}`}>
        {data.tournament && (
          <span className="flex items-center gap-1.5 bg-navy-900/60 border border-navy-750 px-3 py-1 rounded-full text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
            {data.tournament}
          </span>
        )}
        <span className="bg-navy-900/60 border border-navy-750 px-3 py-1 rounded-full text-zinc-400">
          {data.dateStr} &middot; {data.timeStr}
        </span>
        {data.venue && data.venue !== 'N/A' && (
          <span className="bg-navy-900/60 border border-navy-750 px-3 py-1 rounded-full text-zinc-400">
            🏟️ {data.venue}
          </span>
        )}
        {data.status === 'live' && (
          <span className="inline-flex items-center gap-1.5 bg-lime-500/10 border border-lime-500/25 px-3 py-1 rounded-full text-lime-400 font-bold">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
            Live data · refreshed every 30s
          </span>
        )}
        {data.note && (
          <span className="bg-amber-500/10 border border-amber-500/25 px-3 py-1 rounded-full text-amber-400">
            {data.note}
          </span>
        )}
      </div>
    </div>
  );
}
