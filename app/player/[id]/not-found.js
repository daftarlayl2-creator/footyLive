import Link from 'next/link';
import { UserRoundSearch } from 'lucide-react';

export default function PlayerNotFound() {
  return (
    <div className="app-card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <UserRoundSearch className="h-9 w-9 text-zinc-400" aria-hidden="true" />
      <h1 className="text-xl font-extrabold text-navy-900 dark:text-white">Player not found</h1>
      <p className="text-sm text-navy-500 dark:text-zinc-400">This player is not listed by our data provider. Open a club’s squad to find a player profile.</p>
      <Link href="/standings" className="tactile lime-cta rounded-xl px-4 py-2 text-sm font-bold">Browse clubs</Link>
    </div>
  );
}
