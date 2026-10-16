import StandingsView from '@/components/standings/StandingsView';
import { DEFAULT_STANDINGS_LEAGUE, STANDINGS_LEAGUES, findStandingsLeague } from '@/lib/standings';
import { getStandingsBundle } from '@/lib/providers/standingsProvider';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'League Standings, Top Scorers & Assists — Limon Live',
  description:
    'Official league tables for the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, the Champions League, Botola Pro and more — with top scorers and assists.',
};

const VIEWS = new Set(['table', 'scorers', 'assists']);

export default async function StandingsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const leagueParam = Array.isArray(params.league) ? params.league[0] : params.league;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;

  const league = findStandingsLeague(leagueParam) || findStandingsLeague(DEFAULT_STANDINGS_LEAGUE);
  const view = VIEWS.has(viewParam) ? viewParam : 'table';

  // Server-render the selected league so the first paint already has the table;
  // the client view takes over for league switches (and retries on failure).
  let initialData = null;
  try {
    initialData = await getStandingsBundle(league.slug);
  } catch {
    initialData = null;
  }

  return (
    <StandingsView
      leagues={STANDINGS_LEAGUES.map(({ slug, name, shortName, country }) => ({ slug, name, shortName, country }))}
      initialLeague={league.slug}
      initialView={view}
      initialData={initialData}
    />
  );
}
