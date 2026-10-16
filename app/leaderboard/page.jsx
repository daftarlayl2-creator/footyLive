import Link from 'next/link';
import { Medal, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { LeaderboardTableSafe } from '@/components/leaderboard/LeaderboardTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Global Predictor Leaderboard — top tipsters | Limon Live',
  description:
    'The live ranking of Limon Live’s top predictors: accuracy rate, active win streaks and the badges each tipster currently holds. Updated as full-time whistles settle the calls.',
};

/**
 * /leaderboard — the global predictor table.
 *
 * Rankings are computed on the server from settled "Who will win?" predictions
 * (accuracy, win streaks, badges); the client table polls the live API.
 */
export default function LeaderboardPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="glass-panel relative overflow-hidden rounded-3xl p-6 text-center sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(204,255,0,0.14),transparent_60%)]" aria-hidden="true" />
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-lime-700 dark:text-lime-300">Global Leaderboard</p>
        <h1 className="mt-2 flex items-center justify-center gap-2.5 text-3xl font-black text-navy-900 dark:text-white">
          <Trophy className="h-7 w-7 text-lime-500" aria-hidden="true" />
          The sharpest predictors on Limon Live
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-navy-500 dark:text-zinc-400">
          Every call is settled against the real full-time score on the server — then accuracy, win streaks and badges update live here.
          Land three correct calls in a row for the <strong className="text-lime-700 dark:text-lime-300">Hot Hand</strong> badge, hold
          <strong className="text-lime-700 dark:text-lime-300"> 75%+ accuracy</strong> over eight settled picks for <strong className="text-lime-700 dark:text-lime-300">Sharpshooter</strong>.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link href="/?tab=live" className="lime-cta tactile inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black">
            <Medal className="h-3.5 w-3.5" aria-hidden="true" />
            Make a prediction
          </Link>
          <Link href="/spin" className="tactile inline-flex items-center gap-2 rounded-2xl border border-lime-500/30 px-5 py-2.5 text-xs font-black text-lime-700 dark:text-lime-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Daily Lemon Wheel
          </Link>
        </div>
      </header>

      <LeaderboardTableSafe />

      <p className="flex items-center justify-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        Rankings refresh automatically as matches finish — one settled outcome per fan per match, verified on the server.
      </p>
    </div>
  );
}
