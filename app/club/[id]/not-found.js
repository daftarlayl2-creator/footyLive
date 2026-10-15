import Link from 'next/link';
import { SearchX, Trophy } from 'lucide-react';

export default function ClubNotFound() {
  return (
    <div className="app-card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-100 text-navy-500 dark:bg-navy-950 dark:text-zinc-400">
        <SearchX className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-extrabold text-navy-900 dark:text-white">Club not found</h1>
      <p className="max-w-sm text-sm text-navy-500 dark:text-zinc-400">
        We couldn&apos;t find a club profile for this link. Browse the league tables to find the team you&apos;re looking for.
      </p>
      <Link
        href="/standings"
        className="tactile mt-2 inline-flex items-center gap-2 rounded-2xl bg-lime-500 px-4 py-2.5 text-xs font-extrabold text-navy-950 shadow-glow-lime"
      >
        <Trophy className="h-4 w-4" aria-hidden="true" /> Browse standings
      </Link>
    </div>
  );
}
