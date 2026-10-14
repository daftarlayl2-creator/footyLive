import crypto from 'crypto';
import logger from './logger';
import { Match, MatchStats, Channel } from './types';
import {
  WatchFootyProvider,
  getMatchDetails as getWatchFootyMatchDetails,
  getMatchStats as getWatchFootyMatchStats,
  getLeagues,
  getTopTeams,
} from './providers/watchFooty';
import {
  getEspnMatches,
  getEspnMatchById,
  getEspnMatchStats,
  isEspnMatchId,
} from './providers/espn';
import { CdnLiveProvider } from './providers/cdnLive';
import { StreamedPkProvider } from './providers/streamedPk';
import { LiveFeedProvider } from './providers/liveFeed';
import { getCacheManager } from './cache/cacheManager';
import { buildProxyUrl, isDirectStreamUrl } from './hlsProxy';
import { detectStreamKind } from './player/servers';
import { teamSimilarity } from './utils/matching';

const SECRET_KEY = process.env.STREAM_SECRET || 'default_stream_hmac_secret_key_123_abc';

export { getLeagues, getTopTeams };

const providers = [
  new WatchFootyProvider(),
  new CdnLiveProvider(),
  new StreamedPkProvider(),
  new LiveFeedProvider(),
];

export function getStreamRedirectUrl(originalUrl: string): string {
  const encoded = Buffer.from(originalUrl).toString('base64url');
  const expires = Date.now() + 4 * 60 * 60 * 1000; // 4 hours expiration
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${encoded}:${expires}`)
    .digest('hex');
  return `/api/stream-redirect?u=${encoded}&expires=${expires}&sig=${signature}`;
}

/**
 * Pick the right local URL for a stream:
 *  - direct HLS/MP4 sources go through the streaming CORS proxy (`/api/proxy`)
 *    so hls.js can load playlists and segments same-origin;
 *  - iframe/embed pages keep using the signed 302 redirect.
 */
export function getProxiedStreamUrl(originalUrl: string): string {
  if (isDirectStreamUrl(originalUrl)) {
    return buildProxyUrl(originalUrl);
  }
  return getStreamRedirectUrl(originalUrl);
}

/**
 * Fixtures for the dashboard.
 *
 * Primary source is ESPN's public scoreboard (real fixtures, live scores,
 * minutes and cards). Matches that also exist in the WatchFooty catalogue are
 * enriched with that provider's stream sources so the player has servers ready
 * before the user even opens the match.
 */
export async function getMatches(): Promise<Match[]> {
  const cache = getCacheManager();
  return cache.swr('all_matches', async () => {
    const watchFooty = providers.find(p => p.id === 'watchfooty') as WatchFootyProvider;

    const [espnMatches, watchFootyMatches] = await Promise.all([
      getEspnMatches(),
      watchFooty ? watchFooty.fetchMatches().catch((err) => {
        logger.error('WatchFooty fixtures failed', err);
        return [] as Match[];
      }) : Promise.resolve([] as Match[]),
    ]);

    if (espnMatches.length > 0) {
      return attachStreamSources(espnMatches, watchFootyMatches);
    }

    logger.warn('ESPN fixtures unavailable, falling back to catalogue provider');
    return watchFootyMatches;
  }, 15);
}

/**
 * Copy stream servers from the catalogue provider onto the matching ESPN
 * fixture (fuzzy team-name matching), so the ESPN data stays authoritative
 * while the players still resolve.
 */
export function attachStreamSources(espnMatches: Match[], catalogue: Match[]): Match[] {
  if (!catalogue.length) return espnMatches;

  return espnMatches.map((match) => {
    const best = catalogue
      .map((candidate) => ({
        candidate,
        score:
          teamSimilarity(match.homeTeam?.name || '', candidate.homeTeam?.name || '') +
          teamSimilarity(match.homeTeam?.name || '', candidate.awayTeam?.name || '') +
          teamSimilarity(match.awayTeam?.name || '', candidate.homeTeam?.name || '') +
          teamSimilarity(match.awayTeam?.name || '', candidate.awayTeam?.name || ''),
      }))
      .sort((a, b) => b.score - a.score)[0];

    // 2.0 ≈ both sides matched; anything lower is not the same fixture.
    if (!best || best.score < 2.0) return match;

    return {
      ...match,
      sources: best.candidate.sources?.length ? best.candidate.sources : match.sources,
      fallbackChannels: best.candidate.fallbackChannels?.length
        ? best.candidate.fallbackChannels
        : match.fallbackChannels,
      venue: match.venue || best.candidate.venue,
      leagueLogo: match.leagueLogo || best.candidate.leagueLogo,
      poster: match.poster || best.candidate.poster,
    };
  });
}

/** Details for a single match — ESPN fixtures and catalogue ids both work. */
export async function getMatchDetails(matchId: string): Promise<Match | null> {
  if (isEspnMatchId(matchId)) {
    const espnMatch = await getEspnMatchById(matchId);
    if (!espnMatch) return null;
    const catalogue = await getMatches().catch(() => [] as Match[]);
    const enriched = catalogue.find((m) => m.id === matchId);
    return enriched ? { ...espnMatch, sources: enriched.sources, fallbackChannels: enriched.fallbackChannels } : espnMatch;
  }
  return getWatchFootyMatchDetails(matchId);
}

/** Statistics for a single match — real ESPN boxscore/commentary when available. */
export async function getMatchStats(matchId: string): Promise<MatchStats | null> {
  if (isEspnMatchId(matchId)) return getEspnMatchStats(matchId);
  return getWatchFootyMatchStats(matchId);
}

export async function getLiveMatches(): Promise<Match[]> {
  const matches = await getMatches();
  return matches.filter(m => m.status === 'live');
}

export async function resolveAllStreams(
  matchTitle: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  preFetchedMatch: Match | null = null
): Promise<{ url: string; proxiedUrl: string; channels: Channel[]; serverCount: number }> {
  const cache = getCacheManager();
  const cacheKey = `streams_${matchId}`;

  return cache.swr(cacheKey, async () => {
    const resolveTasks = providers.map(async provider => {
      try {
        return await provider.resolveStreams(matchTitle, homeTeam, awayTeam, matchId, preFetchedMatch);
      } catch (err) {
        logger.error(`Provider ${provider.name} failed resolving streams`, err, { matchId });
        return [];
      }
    });

    const results = await Promise.allSettled(resolveTasks);
    const allServers: Channel[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allServers.push(...r.value);
      }
    }

    if (allServers.length === 0) {
      throw new Error('No streams available from any provider');
    }

    const qualityOrder: Record<string, number> = { 'FHD': 0, 'HD': 0, '1080p': 0, '720p': 1, 'SD': 2 };
    allServers.sort((a, b) => (qualityOrder[a.quality || 'SD'] || 2) - (qualityOrder[b.quality || 'SD'] || 2));

    const seenUrls = new Set<string>();
    const uniqueServers: Channel[] = [];
    let serverIndex = 1;

    for (const server of allServers) {
      if (!seenUrls.has(server.url)) {
        seenUrls.add(server.url);
        const proxiedUrl = server.proxiedUrl || getProxiedStreamUrl(server.url);
        uniqueServers.push({
          ...server,
          name: `Server ${serverIndex++}`,
          // Feed streams carry signed proxy links; never expose their raw upstream URL.
          url: server.provider === 'livefeed' ? proxiedUrl : server.url,
          proxiedUrl,
          kind: detectStreamKind(proxiedUrl) ?? 'embed',
        });
      }
    }

    return {
      url: uniqueServers[0].url,
      proxiedUrl: uniqueServers[0].proxiedUrl || getProxiedStreamUrl(uniqueServers[0].url),
      channels: uniqueServers,
      serverCount: uniqueServers.length,
    };
  }, 30);
}
