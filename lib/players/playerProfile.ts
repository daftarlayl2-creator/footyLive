import { cache } from 'react';
import { getCacheManager } from '@/lib/cache/cacheManager';
import { espnFetch } from '@/lib/providers/espn';
import logger from '@/lib/logger';
import { normalizePlayerProfile, rosterAthlete } from './normalize';
import { withShowcaseSnapshot } from './showcase';
import { withPortraits } from './portraits';
import type { PlayerProfile } from './types';

const COMMON_API = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer';
const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const PROFILE_TTL_S = 600;

export class PlayerDataUnavailableError extends Error {
  constructor() {
    super('Player data is temporarily unavailable.');
    this.name = 'PlayerDataUnavailableError';
  }
}
const notFound = (err: unknown) => /\bHTTP (400|404)\b/.test(err instanceof Error ? err.message : '');

async function loadIdentity(id: string, league: string): Promise<any | null> {
  const urls = [
    `${COMMON_API}/all/athletes/${id}`,
    ...(league !== 'all' ? [`${COMMON_API}/${league}/athletes/${id}`] : []),
    `${SITE_API}/all/athletes/${id}`,
  ];
  let outage: unknown;
  for (const url of urls) {
    try {
      const data = await espnFetch(url, PROFILE_TTL_S);
      if (normalizePlayerProfile(data)?.id === id) return data;
    } catch (err) { if (!notFound(err)) outage = err; }
  }
  if (outage) throw outage;
  return null;
}

async function loadOverview(id: string, league: string): Promise<any | null> {
  // Soccer's /overview response is stats/news only. Identity lives at the base
  // athlete endpoint; never mistake a successful stats payload for a player.
  const [identity, summary] = await Promise.allSettled([
    loadIdentity(id, league),
    espnFetch(`${COMMON_API}/${league}/athletes/${id}/overview`, PROFILE_TTL_S),
  ]);
  const details = identity.status === 'fulfilled' ? identity.value : null;
  const overview = summary.status === 'fulfilled' ? summary.value : null;
  if (details) return { ...details, ...overview, athlete: details.athlete ?? details, season: details.season ?? overview?.season };
  if (normalizePlayerProfile(overview)?.id === id) return overview;
  if (identity.status === 'rejected') throw identity.reason;
  if (overview) return overview;
  if (summary.status === 'rejected' && !notFound(summary.reason)) throw summary.reason;
  return null;
}

async function loadPlayer(id: string, clubId: string, league: string): Promise<PlayerProfile | null> {
  // A roster link includes provider context. Even leagues whose athlete
  // overview endpoint is unsupported still get real player pages from the
  // same roster data the user clicked, not made-up placeholders or a 404.
  const [overviewResult, rosterResult] = await Promise.allSettled([
    loadOverview(id, league),
    clubId ? espnFetch(`${SITE_API}/${league}/teams/${clubId}/roster`, PROFILE_TTL_S) : Promise.resolve(null),
  ]);
  let roster = rosterResult.status === 'fulfilled' ? rosterResult.value : null;
  let overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
  if (!normalizePlayerProfile(overview) && roster) {
    const athlete = rosterAthlete(roster, id);
    if (athlete) overview = { ...overview, athlete: { ...athlete, team: { ...roster.team, league: { slug: league } } } };
  }
  if (!overview) {
    if (overviewResult.status === 'rejected' || (rosterResult.status === 'rejected' && !notFound(rosterResult.reason))) {
      logger.warn('Player profile unavailable', { id });
      throw new PlayerDataUnavailableError();
    }
    return null;
  }
  const basic = normalizePlayerProfile(overview);
  if (!basic || basic.id !== id) return null;
  const currentLeague = basic.club?.league || league;
  const rosterUrl = basic.club?.id && (basic.club.id !== clubId || currentLeague !== league)
    ? `${SITE_API}/${/^[a-z0-9.-]{1,40}$/i.test(currentLeague) ? currentLeague : 'all'}/teams/${basic.club.id}/roster`
    : null;
  const [currentRoster, stats] = await Promise.allSettled([
    rosterUrl ? espnFetch(rosterUrl, PROFILE_TTL_S) : Promise.resolve(roster),
    espnFetch(`${COMMON_API}/${/^[a-z0-9.-]{1,40}$/i.test(currentLeague) ? currentLeague : 'all'}/athletes/${id}/stats`, PROFILE_TTL_S),
  ]);
  roster = currentRoster.status === 'fulfilled' ? currentRoster.value : null;
  // A stats outage never hides a valid player or replaces missing fields with 0.
  const profile = normalizePlayerProfile(overview, roster, stats.status === 'fulfilled' ? stats.value : null)!;
  // Cutout/headshot candidates for the card; a portrait outage never hides the player.
  return withPortraits(withShowcaseSnapshot(profile));
}

export const getPlayerProfile = cache(async (id: string, clubParam = '', leagueParam = 'all'): Promise<PlayerProfile | null> => {
  if (!/^\d{1,10}$/.test(id)) return null;
  const clubId = /^\d{1,10}$/.test(clubParam) ? clubParam : '';
  const league = /^[a-z0-9.-]{1,40}$/i.test(leagueParam) ? leagueParam : 'all';
  return getCacheManager().swr(`player:profile:v5:${id}:${clubId}:${league}`, () => loadPlayer(id, clubId, league), PROFILE_TTL_S);
});
