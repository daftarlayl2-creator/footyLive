'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Medal, RefreshCw, TrendingUp, Trophy, UserRound } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';

/** Seconds between background refreshes while the tab is visible. */
export const LEADERBOARD_POLL_MS = 30_000;

const MEDAL = ['🥇', '🥈', '🥉'];

function Row({ row, highlight }) {
  return (
    <tr
      data-leaderboard-row={row.rank}
      className={`border-b border-white/5 transition-colors last:border-0 ${highlight ? 'bg-lime-500/10' : 'hover:bg-white/5'}`}
    >
      <td className="px-3 py-3 text-center">
        <span className="text-lg">{MEDAL[row.rank - 1] || <span className="text-xs font-black tabular-nums text-zinc-500">{row.rank}</span>}</span>
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-lime-400/30 bg-lime-500/10 text-xs font-black text-lime-300">
            {(row.handle || '?').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-100">{row.handle || 'Anonymous predictor'}</p>
            <p className="flex flex-wrap items-center gap-1">
              {row.badges.map((badge) => (
                <span key={badge.id} title={badge.label} className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-zinc-200">
                  {badge.emoji} {badge.label}
                </span>
              ))}
              {row.seeded && <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">showcase</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <span className={`inline-flex items-center justify-center rounded-xl px-2.5 py-1 text-sm font-black tabular-nums ${
          (row.accuracy ?? 0) >= 75 ? 'bg-lime-500/15 text-lime-300' : (row.accuracy ?? 0) >= 50 ? 'bg-white/10 text-zinc-100' : 'bg-white/5 text-zinc-300'
        }`} data-accuracy={row.accuracy ?? ''}>
          {row.accuracy === null ? '—' : `${row.accuracy}%`}
        </span>
      </td>
      <td className="px-3 py-3 text-center text-sm font-bold tabular-nums text-zinc-200" data-streak={row.streak}>
        {row.streak > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            {row.streak}
          </span>
        ) : (
          <span className="text-zinc-500">0</span>
        )}
      </td>
      <td className="px-3 py-3 text-center text-xs tabular-nums text-zinc-400">
        {row.correct}/{row.settled}
        <span className="ml-1 text-[10px] text-zinc-500">(best {row.bestStreak})</span>
      </td>
    </tr>
  );
}

/**
 * Global leaderboard table — top predictors by accuracy and win streaks, with
 * their active badges. Polls `/api/leaderboard` while the tab is visible, and
 * always cleans its interval up on unmount.
 */
export default function LeaderboardTable() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch('/api/leaderboard', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.rows)) throw new Error('Leaderboard unavailable');
      setData(body);
      setError('');
    } catch {
      setError('The live ranking is temporarily unavailable. It refreshes automatically.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const id = setInterval(() => { if (!document.hidden) void load(); }, LEADERBOARD_POLL_MS);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const rows = data?.rows || [];

  return (
    <div className="glass-panel overflow-hidden rounded-3xl" data-leaderboard-table="">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-zinc-200">
          <Trophy className="h-4 w-4 text-lime-400" aria-hidden="true" />
          Top predictors
        </h2>
        <div className="flex items-center gap-2">
          <span role="status" className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/25 bg-lime-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-lime-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-400" aria-hidden="true" />
            Live
          </span>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh leaderboard"
            className="tactile rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 hover:border-lime-400/40 hover:text-lime-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="border-b border-amber-400/20 bg-amber-500/10 px-5 py-2.5 text-xs font-semibold text-amber-200">{error}</p>}

      {loading && !rows.length ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <UserRound className="h-9 w-9 text-zinc-600" aria-hidden="true" />
          <p className="text-sm font-bold text-zinc-300">No settled predictions yet</p>
          <p className="max-w-sm text-xs text-zinc-500">
            The table fills up as fans call match results and the full-time whistle settles them. Be among the first names on the board.
          </p>
          <Link href="/?tab=live" className="lime-cta tactile inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black">
            <Medal className="h-3.5 w-3.5" aria-hidden="true" />
            Make your first call
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                <th scope="col" className="px-3 py-2.5 text-center">#</th>
                <th scope="col" className="px-3 py-2.5">Predictor</th>
                <th scope="col" className="px-3 py-2.5 text-center">Accuracy</th>
                <th scope="col" className="px-3 py-2.5 text-center">Win streak</th>
                <th scope="col" className="px-3 py-2.5 text-center">Correct / Settled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.userId} row={row} highlight={data?.me?.userId === row.userId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.me && (
        <p className="border-t border-white/10 bg-white/5 px-5 py-3 text-xs text-zinc-300" data-leaderboard-me="">
          Your record: <strong className="text-lime-300">{data.me.accuracy === null ? 'no settled call yet' : `${data.me.accuracy}% accuracy`}</strong>
          {' · '}streak <strong className="text-lime-300">{data.me.streak}</strong>
          {' · '}rank <strong className="text-lime-300">{data.me.rank}</strong>
        </p>
      )}
    </div>
  );
}

/** Error-isolated wrapper used by /leaderboard. */
export function LeaderboardTableSafe() {
  return (
    <ErrorBoundary name="leaderboard" title="Leaderboard hit a snag" message="The ranking table could not be mounted. Your record is safe — try again in a moment.">
      <LeaderboardTable />
    </ErrorBoundary>
  );
}
