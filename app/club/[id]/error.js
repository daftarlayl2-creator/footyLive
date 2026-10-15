'use client';

import Link from 'next/link';
import { RefreshCw, Trophy, WifiOff } from 'lucide-react';

/** Shown when the club's live data provider is unreachable (not for unknown clubs). */
export default function ClubError({ reset }) {
  return (
    <div className="app-card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-14 text-center animate-fade-in">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
        <WifiOff className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-extrabold text-navy-900 dark:text-white">Club data is temporarily unavailable</h1>
      <p className="max-w-sm text-sm text-navy-500 dark:text-zinc-400">
        Our live football data provider didn&apos;t respond. This is usually brief — try again in a moment.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="tactile inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-lime-500 px-4 py-2.5 text-xs font-extrabold text-navy-950 shadow-glow-lime"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
        <Link
          href="/standings"
          className="tactile inline-flex items-center gap-2 rounded-2xl border border-navy-200 px-4 py-2.5 text-xs font-extrabold text-navy-700 dark:border-navy-750 dark:text-zinc-300"
        >
          <Trophy className="h-4 w-4" aria-hidden="true" /> Standings
        </Link>
      </div>
    </div>
  );
}
