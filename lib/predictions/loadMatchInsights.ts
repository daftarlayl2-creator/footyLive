import { resolveClub } from '@/lib/clubs/clubProfile';
import { clubHref } from '@/lib/clubs/links';
import { formFromResults, normalizeTeamSchedule } from '@/lib/clubs/espnClub';
import { espnFetch } from '@/lib/providers/espn';
import { getStandingsBundle } from '@/lib/providers/standingsProvider';
import type { Match, Team } from '@/lib/types';
import { buildInsights, computeWinProbability, summarizeH2H } from './matchInsights';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
async function history(team: Team) {
  const param = clubHref(team)?.split('/').pop();
  const { espnId } = param ? await resolveClub(param) : { espnId: null };
  if (!espnId) return { id: '', results: [] };
  const json = await espnFetch(`${ESPN}/all/teams/${espnId}/schedule`, 300);
  return { id: espnId, results: normalizeTeamSchedule(json, espnId) };
}

/** Schedule history + same-league official points, cached by the existing providers. */
export async function loadMatchInsights(match: Match) {
  const [homeResult, awayResult, tableResult] = await Promise.allSettled([
    history(match.homeTeam),
    history(match.awayTeam),
    match.leagueSlug ? getStandingsBundle(match.leagueSlug) : Promise.resolve(null),
  ]);
  const home = homeResult.status === 'fulfilled' ? homeResult.value : { id: match.homeTeam.id || '', results: [] };
  const away = awayResult.status === 'fulfilled' ? awayResult.value : { id: match.awayTeam.id || '', results: [] };
  // Never include this fixture itself, or later results, in recent form/H2H.
  const cutoff = Math.min(match.timestamp || Date.now(), Date.now());
  const before = (results: typeof home.results) => results.filter((result) => Date.parse(result.date) < cutoff);
  const homeForm = formFromResults(before(home.results));
  const awayForm = formFromResults(before(away.results));
  const h2h = summarizeH2H([...home.results, ...away.results], home.id, away.id, cutoff);
  const rows = tableResult.status === 'fulfilled' ? tableResult.value?.groups.flatMap((group) => group.rows) || [] : [];
  const homeStanding = rows.find((row) => row.team.id === home.id);
  const awayStanding = rows.find((row) => row.team.id === away.id);
  const input = {
    homeName: match.homeTeam.name, awayName: match.awayTeam.name,
    homeForm, awayForm, h2h,
    homePoints: homeStanding?.points, awayPoints: awayStanding?.points,
    homePlayed: homeStanding?.played, awayPlayed: awayStanding?.played,
  };
  const probabilities = computeWinProbability(input);
  return {
    probabilities,
    insights: buildInsights(input),
    homeForm, awayForm, h2h,
    homePoints: homeStanding?.points ?? null, awayPoints: awayStanding?.points ?? null,
    coverage: {
      form: !!(homeForm.length && awayForm.length),
      h2h: !!h2h?.total,
      standings: !!(homeStanding && awayStanding),
    },
    updatedAt: Date.now(),
  };
}
