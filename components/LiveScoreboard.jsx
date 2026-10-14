'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import LiveMinute from './LiveMinute';

const THEMES = {
  lime: {
    name: 'EVIV Lime',
    glow1: 'bg-lime-500/10',
    glow2: 'bg-lime-500/5',
    border: 'border-lime-500/25',
    shadow: 'shadow-[0_0_50px_rgba(50,205,50,0.16)]',
    accent: 'text-lime-400',
    ring: 'ring-lime-500/35 border-lime-500/25',
    dot: 'bg-lime-500',
  },
  navy: {
    name: 'Navy Night',
    glow1: 'bg-navy-600/25',
    glow2: 'bg-lime-600/5',
    border: 'border-navy-600/45',
    shadow: 'shadow-[0_0_50px_rgba(30,51,88,0.45)]',
    accent: 'text-navy-200',
    ring: 'ring-navy-400/35 border-navy-500/40',
    dot: 'bg-navy-300',
  },
  crimson: {
    name: 'Crimson Derby',
    glow1: 'bg-red-600/10',
    glow2: 'bg-rose-600/5',
    border: 'border-red-500/20',
    shadow: 'shadow-[0_0_50px_rgba(239,68,68,0.12)]',
    accent: 'text-red-400',
    ring: 'ring-red-500/35 border-red-500/20',
    dot: 'bg-red-500',
  },
  amber: {
    name: 'Amber Kickoff',
    glow1: 'bg-amber-600/10',
    glow2: 'bg-yellow-600/5',
    border: 'border-amber-500/20',
    shadow: 'shadow-[0_0_50px_rgba(245,158,11,0.12)]',
    accent: 'text-amber-400',
    ring: 'ring-amber-500/35 border-amber-500/20',
    dot: 'bg-amber-500',
  },
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
  const [activeTheme, setActiveTheme] = useState('lime');

  const t = THEMES[activeTheme] || THEMES.lime;
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
    try {
      const saved = localStorage.getItem('scoreboard_theme');
      if (saved && THEMES[saved]) setActiveTheme(saved);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (data.status !== 'live') return;
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [data.status, refresh]);

  const changeTheme = (key) => {
    setActiveTheme(key);
    try {
      localStorage.setItem('scoreboard_theme', key);
    } catch (e) {}
  };

  const homeScorers = data.scorers?.home || [];
  const awayScorers = data.scorers?.away || [];

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-navy-950 px-6 py-6 shadow-2xl transition-all duration-500 ${t.border} ${t.shadow}`}>
      {/* Dynamic glow backgrounds */}
      <div className={`absolute top-0 left-1/4 w-[250px] h-[250px] pointer-events-none filter blur-3xl transition-all duration-500 ${t.glow1}`} />
      <div className={`absolute bottom-0 right-1/4 w-[250px] h-[250px] pointer-events-none filter blur-3xl transition-all duration-500 ${t.glow2}`} />

      {/* Scoreboard theme selector + manual refresh */}
      <div className="absolute top-3.5 right-4 z-20 flex items-center gap-1.5 bg-navy-950/80 backdrop-blur-md border border-navy-800 px-2 py-1 rounded-full shadow-lg">
        <button
          onClick={refresh}
          className="mr-1 text-zinc-400 hover:text-lime-400 transition-colors"
          title="Refresh live data"
          aria-label="Refresh live data"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''} ${!loading && data.status === 'live' ? 'text-lime-400' : ''}`} />
        </button>
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-550 mr-1 select-none">Theme</span>
        {Object.keys(THEMES).map((key) => {
          const isActive = activeTheme === key;
          return (
            <button
              key={key}
              onClick={() => changeTheme(key)}
              className={`h-3.5 w-3.5 rounded-full transition-all duration-300 ${THEMES[key].dot} ${
                isActive
                  ? 'scale-110 ring-2 ring-white/95 shadow-md shadow-black/80'
                  : 'scale-90 opacity-40 hover:opacity-90 hover:scale-100'
              }`}
              title={`Switch theme to ${THEMES[key].name}`}
            />
          );
        })}
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
          <span className="flex items-center gap-1.5 bg-navy-900/60 border border-navy-800 px-3 py-1 rounded-full text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
            {data.tournament}
          </span>
        )}
        <span className="bg-navy-900/60 border border-navy-800 px-3 py-1 rounded-full text-zinc-400">
          {data.dateStr} &middot; {data.timeStr}
        </span>
        {data.venue && data.venue !== 'N/A' && (
          <span className="bg-navy-900/60 border border-navy-800 px-3 py-1 rounded-full text-zinc-400">
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
