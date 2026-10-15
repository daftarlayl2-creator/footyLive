/**
 * Official standings + top scorers / assists for one league.
 *
 *  - ESPN leagues: `/apis/v2/sports/soccer/{slug}/standings` (table) and
 *    `/apis/site/v2/sports/soccer/{slug}/statistics` (goals & assists leaders).
 *  - Botola Pro (not on ESPN): TheSportsDB `lookuptable.php` — the free tier
 *    only exposes the top of the table, which is flagged as `partial`.
 *
 * Bundles are cached for a few minutes (tables only move when a match ends).
 * Nothing is invented: a missing feed yields empty lists and a note.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import {
  findStandingsLeague,
  normalizeEspnLeaders,
  normalizeEspnStandings,
  normalizeSportsDbTable,
  seasonLabelFor,
  type LeaderRow,
  type StandingsGroup,
  type StandingsLeague,
} from '@/lib/standings';
import { espnFetch } from './espn';
import { fetchJson } from './http';

export const STANDINGS_TTL_S = 300;
const ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer';
const ESPN_SITE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const SPORTSDB_URL = 'https://www.thesportsdb.com/api/v1/json/3';

export interface StandingsBundle {
  league: { slug: string; name: string; shortName: string; country: string; logo?: string };
  season: string | null;
  groups: StandingsGroup[];
  scorers: LeaderRow[];
  assists: LeaderRow[];
  source: 'espn' | 'thesportsdb';
  /** True when the source only exposes part of the table. */
  partial: boolean;
  /** False when the league has no scorers / assists feed at all. */
  leadersAvailable: boolean;
  updatedAt: number;
}

function leagueLogo(standingsJson: any, statsJson: any): string | undefined {
  const fromStats = statsJson?.league?.logos?.find?.((l: any) => Array.isArray(l?.rel) && l.rel.includes('default'))?.href
    || statsJson?.league?.logos?.[0]?.href;
  if (fromStats) return String(fromStats);
  const id = standingsJson?.id;
  return id && /^\d+$/.test(String(id)) && String(id).length < 6
    ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`
    : undefined;
}

async function loadEspnBundle(league: StandingsLeague): Promise<StandingsBundle> {
  const [standingsResult, statsResult] = await Promise.allSettled([
    espnFetch(`${ESPN_STANDINGS_URL}/${league.slug}/standings`, STANDINGS_TTL_S),
    espnFetch(`${ESPN_SITE_URL}/${league.slug}/statistics`, STANDINGS_TTL_S * 2),
  ]);

  const standingsJson = standingsResult.status === 'fulfilled' ? standingsResult.value : null;
  const statsJson = statsResult.status === 'fulfilled' ? statsResult.value : null;
  if (standingsResult.status === 'rejected') logger.warn('ESPN standings fetch failed', { league: league.slug, error: String(standingsResult.reason) });
  if (statsResult.status === 'rejected') logger.warn('ESPN leaders fetch failed', { league: league.slug, error: String(statsResult.reason) });

  const { season, groups } = normalizeEspnStandings(standingsJson);
  const scorers = normalizeEspnLeaders(statsJson, 'goals');
  const assists = normalizeEspnLeaders(statsJson, 'assists');

  if (!groups.length && !scorers.length && !assists.length) {
    throw new Error(`No standings data available for ${league.slug}`);
  }

  return {
    league: { slug: league.slug, name: league.name, shortName: league.shortName, country: league.country, logo: leagueLogo(standingsJson, statsJson) },
    season,
    groups,
    scorers,
    assists,
    source: 'espn',
    partial: false,
    leadersAvailable: league.leaders,
    updatedAt: Date.now(),
  };
}

async function loadSportsDbBundle(league: StandingsLeague): Promise<StandingsBundle> {
  const season = seasonLabelFor();
  const json = await fetchJson(`${SPORTSDB_URL}/lookuptable.php?l=${league.sportsDbId}&s=${season}`, {
    revalidate: STANDINGS_TTL_S,
  });
  const groups = normalizeSportsDbTable(json);
  if (!groups.length) throw new Error(`No standings data available for ${league.slug}`);
  const rows = groups[0].rows;
  return {
    league: { slug: league.slug, name: league.name, shortName: league.shortName, country: league.country },
    season,
    groups,
    scorers: [],
    assists: [],
    source: 'thesportsdb',
    // The free tier caps the table at the top five clubs.
    partial: rows.length <= 5,
    leadersAvailable: false,
    updatedAt: Date.now(),
  };
}

export async function getStandingsBundle(slug: string): Promise<StandingsBundle | null> {
  const league = findStandingsLeague(slug);
  if (!league) return null;
  return getCacheManager().swr(
    `standings:v1:${league.slug}`,
    () => (league.provider === 'thesportsdb' ? loadSportsDbBundle(league) : loadEspnBundle(league)),
    STANDINGS_TTL_S
  );
}
