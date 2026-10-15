'use client';

import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';

export default function PlayerError({ reset }) {
  return (
    <div className="app-card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center" role="alert">
      <WifiOff className="h-9 w-9 text-amber-500" aria-hidden="true" />
      <h1 className="text-xl font-extrabold text-navy-900 dark:text-white">Player data is temporarily unavailable</h1>
      <p className="text-sm text-navy-500 dark:text-zinc-400">The football data provider did not respond. Your link may still be valid — try again in a moment.</p>
      <button type="button" onClick={reset} className="tactile lime-cta inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
      <Link href="/standings" className="text-xs font-bold text-navy-600 underline dark:text-zinc-300">Browse clubs</Link>
    </div>
  );
}
