'use client';

import useSWR from 'swr';
import {
  LEAGUES_TO_SHOW,
  computeLeagueTables,
  computeTopScorers,
} from '@/lib/standings';

export { LEAGUES_TO_SHOW, computeLeagueTables, computeTopScorers };

/**
 * League Standings Page - shows real league tables and top scorers.
 *
 * Fetches match data from `/api/matches` and computes per-team league tables
 * and top goalscorers. Supports Premier League, La Liga, Serie A, Bundesliga,
 * Ligue 1, UEFA Champions League, Botola Pro, and any active tournament.
 */
export default function StandingsPage() {
  const { data: payload, error } = useSWR('/api/matches', fetcher);

  if (error) return <div className="p-8 text-center">Error loading data</div>;
  if (!payload) return <div className="p-8 text-center">Loading...</div>;

  const tables = computeLeagueTables(payload);
  const topScorers = computeTopScorers(payload);

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-extrabold text-navy-800 dark:text-zinc-100">
            League Standings &amp; Top Scorers
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Live club standings and goal tallies updated automatically from active matchdays.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tables.map((table) => (
          <div
            key={table.league}
            className="rounded-2xl border border-navy-700 bg-navy-950/90 p-4 backdrop-blur-md shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-zinc-100">
                {table.league}
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-lime-400">
                {table.matchesPlayed} {table.matchesPlayed === 1 ? 'match' : 'matches'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs">
                <thead>
                  <tr className="border-b border-navy-700 text-zinc-400 text-[11px] font-bold uppercase">
                    <th className="p-2 text-left">Pos</th>
                    <th className="p-2 text-left">Team</th>
                    <th className="p-2 text-center">P</th>
                    <th className="p-2 text-center">W</th>
                    <th className="p-2 text-center">D</th>
                    <th className="p-2 text-center">L</th>
                    <th className="p-2 text-center">GF</th>
                    <th className="p-2 text-center">GA</th>
                    <th className="p-2 text-center">GD</th>
                    <th className="p-2 text-center">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/60">
                  {table.standings.map((team, idx) => (
                    <tr key={team.name} className={idx < 3 ? 'bg-lime-500/[0.04]' : ''}>
                      <td className="p-2 font-bold text-lime-400">{team.position ?? idx + 1}</td>
                      <td className="p-2">
                        <span className="font-semibold text-zinc-100">
                          {team.name}
                        </span>
                      </td>
                      <td className="p-2 text-center text-zinc-300">{team.played || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.won || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.drawn || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.lost || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.goalsFor || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.goalsAgainst || 0}</td>
                      <td className="p-2 text-center text-zinc-300">{team.goalDifference || 0}</td>
                      <td className="p-2 text-center font-extrabold text-lime-400">{team.points || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-navy-700">
        <h2 className="text-2xl font-bold text-navy-800 dark:text-zinc-100 mb-4">Top 10 Scorers</h2>
        {topScorers.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Goal scorers will appear here as live and completed matches report goals.
          </p>
        ) : (
          <ol className="space-y-2">
            {topScorers.map((scorer, idx) => (
              <li
                key={`${scorer.name}-${scorer.team}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-navy-800 bg-navy-950/70 px-4 py-2.5 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-extrabold text-lime-400 w-5">{scorer.rank ?? idx + 1}</span>
                  <span className="font-bold text-zinc-100 truncate">{scorer.name}</span>
                  <span className="text-zinc-400 text-[11px] truncate">({scorer.team})</span>
                </div>
                <span className="font-extrabold text-lime-400 shrink-0">
                  {scorer.goals} {scorer.goals === 1 ? 'goal' : 'goals'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Simple SWR fetcher. */
function fetcher(url) {
  return fetch(url, { cache: 'no-store' }).then((res) => res.json());
}
