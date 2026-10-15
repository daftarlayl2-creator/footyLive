/**
 * Club profile loader for `/club/[id]` and `/api/club/[id]`.
 *
 *  core  (ESPN, 10 min cache): profile, results, fixtures, squad, form
 *  facts (Wikipedia/Wikidata, 24 h cache): bio, founded, stadium, manager
 *
 * The two layers are independent so the page can stream facts in after the
 * ESPN-powered hero and tabs have rendered.
 */
import { cache } from 'react';
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { espnFetch } from '@/lib/providers/espn';
import { fetchJson } from '@/lib/providers/http';
import { nameFromSlug, parseClubParam } from './links';
import {
  formFromResults,
  homeVenueFrom,
  normalizeEspnTeam,
  normalizeRoster,
  normalizeTeamSchedule,
  pickEspnTeamSearchHit,
  type ClubInfo,
  type ClubMatch,
  type SquadPlayer,
} from './espnClub';
import { findWikipediaTitle, getWikidataFacts, getWikipediaSummary, type WikiSummary } from './wiki';

const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/search/v2';
const CORE_TTL_S = 600;
const FACTS_TTL_S = 86_400;
const SEARCH_TTL_S = 86_400;

export interface ClubCore {
  club: ClubInfo;
  /** Finished matches, newest first. */
  results: ClubMatch[];
  /** Upcoming / live matches, soonest first. */
  fixtures: ClubMatch[];
  squad: SquadPlayer[];
  form: Array<'W' | 'D' | 'L'>;
  homeVenue?: string;
  updatedAt: number;
}

export interface ClubFacts {
  founded?: number;
  stadium?: string;
  manager?: string;
  managerSince?: string;
  summary?: WikiSummary | null;
}

export interface ResolvedClub {
  espnId: string | null;
  slug: string;
}

/**
 * Upstream outage (network error, timeout, 5xx). Distinct from "this club
 * does not exist" so pages can offer a retry instead of a misleading 404.
 */
export class ClubDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClubDataUnavailableError';
  }
}

/** ESPN answers unknown ids/queries with 400/404 — that means "not found", not "down". */
export function isUpstreamNotFound(err: unknown): boolean {
  return /\bHTTP (400|404)\b/.test(err instanceof Error ? err.message : String(err));
}

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                 */
/* -------------------------------------------------------------------------- */

async function searchEspnTeamId(name: string): Promise<string | null> {
  const query = name.trim();
  if (!query) return null;
  return getCacheManager().swr(
    `club:search:v1:${query.toLowerCase()}`,
    async () => {
      const url = `${ESPN_SEARCH}?query=${encodeURIComponent(query)}&limit=8&type=team&sport=soccer`;
      const hit = pickEspnTeamSearchHit(await fetchJson(url, { revalidate: SEARCH_TTL_S }), query);
      return hit?.espnId ?? null;
    },
    SEARCH_TTL_S
  );
}

/** `/club/359-arsenal` → 359; `/club/maghreb-de-fes` → ESPN search by name. */
export const resolveClub = cache(async (param: string): Promise<ResolvedClub> => {
  const parsed = parseClubParam(param);
  if (parsed.espnId || !parsed.slug) return parsed;
  try {
    return { espnId: await searchEspnTeamId(nameFromSlug(parsed.slug)), slug: parsed.slug };
  } catch (err) {
    if (isUpstreamNotFound(err)) return { espnId: null, slug: parsed.slug };
    logger.warn('ESPN team search failed', { slug: parsed.slug, error: String(err) });
    throw new ClubDataUnavailableError(`Club search unavailable for "${parsed.slug}"`);
  }
});

/* -------------------------------------------------------------------------- */
/*  Core (ESPN)                                                                */
/* -------------------------------------------------------------------------- */

async function loadSchedule(espnId: string, leagueSlug: string | undefined, fixtures: boolean): Promise<ClubMatch[]> {
  const suffix = fixtures ? '?fixture=true' : '';
  try {
    // `all` covers every competition (league, cups, Europe).
    return normalizeTeamSchedule(await espnFetch(`${ESPN_SITE}/all/teams/${espnId}/schedule${suffix}`, 300), espnId);
  } catch (err) {
    if (!leagueSlug) throw err;
    return normalizeTeamSchedule(await espnFetch(`${ESPN_SITE}/${leagueSlug}/teams/${espnId}/schedule${suffix}`, 300), espnId);
  }
}

async function loadClubCore(espnId: string): Promise<ClubCore | null> {
  let teamJson: unknown;
  try {
    teamJson = await espnFetch(`${ESPN_SITE}/all/teams/${espnId}`, CORE_TTL_S);
  } catch (err) {
    if (isUpstreamNotFound(err)) return null;
    logger.warn('ESPN team fetch failed', { espnId, error: String(err) });
    // Thrown (not cached) so the next request retries the upstream.
    throw new ClubDataUnavailableError(`Club ${espnId} is temporarily unavailable`);
  }
  const club = normalizeEspnTeam(teamJson);
  if (!club) return null;

  const leagueSlug = club.league?.slug;
  const [resultsRes, fixturesRes, rosterRes] = await Promise.allSettled([
    loadSchedule(espnId, leagueSlug, false),
    loadSchedule(espnId, leagueSlug, true),
    leagueSlug ? espnFetch(`${ESPN_SITE}/${leagueSlug}/teams/${espnId}/roster`, 3600) : Promise.reject(new Error('no league')),
  ]);

  const all = [
    ...(resultsRes.status === 'fulfilled' ? resultsRes.value : []),
    ...(fixturesRes.status === 'fulfilled' ? fixturesRes.value : []),
  ];
  const byId = new Map<string, ClubMatch>();
  for (const match of all) byId.set(match.id, match);
  const matches = Array.from(byId.values());

  const results = matches
    .filter((m) => m.status === 'finished')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const fixtures = matches
    .filter((m) => m.status === 'scheduled' || m.status === 'live' || m.status === 'postponed')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return {
    club,
    results,
    fixtures,
    squad: rosterRes.status === 'fulfilled' ? normalizeRoster(rosterRes.value) : [],
    form: formFromResults(results),
    homeVenue: homeVenueFrom(matches),
    updatedAt: Date.now(),
  };
}

export const getClubCore = cache(async (espnId: string): Promise<ClubCore | null> => {
  if (!/^\d+$/.test(espnId)) return null;
  return getCacheManager().swr(`club:core:v1:${espnId}`, () => loadClubCore(espnId), CORE_TTL_S);
});

/* -------------------------------------------------------------------------- */
/*  Facts (Wikipedia / Wikidata)                                               */
/* -------------------------------------------------------------------------- */

async function loadClubFacts(name: string, national: boolean): Promise<ClubFacts> {
  const title = await findWikipediaTitle(name, { national }).catch(() => null);
  if (!title) return { summary: null };
  const summary = await getWikipediaSummary(title).catch(() => null);
  const facts = summary?.wikidataId ? await getWikidataFacts(summary.wikidataId).catch(() => ({})) : {};
  return { ...facts, summary };
}

/** `national` is a primitive flag (not an options object) so React `cache()` can de-duplicate calls. */
export const getClubFacts = cache(async (name: string, national = false): Promise<ClubFacts> => {
  const key = `club:facts:v1:${national ? 'n:' : ''}${name.trim().toLowerCase()}`;
  try {
    return await getCacheManager().swr(key, () => loadClubFacts(name, national), FACTS_TTL_S);
  } catch (err) {
    logger.warn('Club facts unavailable', { name, error: String(err) });
    return { summary: null };
  }
});

/**
 * Short bio built only from real ESPN data, used when Wikipedia has no
 * article for the club.
 */
export function fallbackClubBio(club: ClubInfo): string {
  const parts: string[] = [];
  const nickname = club.nickname ? ` — nicknamed “${club.nickname}” —` : '';
  if (club.league?.name) parts.push(`${club.name}${nickname} compete in the ${club.league.name}.`);
  else parts.push(`${club.name}${nickname} is a professional football club.`);
  if (club.standingSummary) parts.push(`They are currently ${club.standingSummary}.`);
  const record = club.record;
  if (record && (record.wins || record.draws || record.losses)) {
    const played = record.played ?? record.wins + record.draws + record.losses;
    parts.push(
      `This season they have won ${record.wins}, drawn ${record.draws} and lost ${record.losses} of their ${played} league matches.`
    );
  }
  return parts.join(' ');
}
