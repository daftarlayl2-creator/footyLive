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
import { LiveFeedProvider, findMatchFeedChannels, selectActiveFeedChannels } from './providers/liveFeed';
import { getLiveChannels, toPlaybackUrl } from './broadcast/feeds';
import type { LiveChannel } from './broadcast/types';
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
      const enriched = attachStreamSources(espnMatches, watchFootyMatches);
      // Cards with no catalogue servers still need a route into the player.
      // Only fetch the feed when ESPN actually has live, unlinked fixtures.
      if (!enriched.some((m) => m.source === 'espn' && m.status === 'live' && !m.sources?.length)) {
        return enriched;
      }
      try {
        return await attachLiveFeedPreviews(enriched, await getLiveChannels());
      } catch (err) {
        logger.warn('Live feed preview unavailable for ESPN matches', { error: String(err) });
        return enriched;
      }
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

/** Add a stream preview to unlinked, *live* ESPN cards without inventing a match-specific link. */
export async function attachLiveFeedPreviews(matches: Match[], channels: LiveChannel[]): Promise<Match[]> {
  const unlinked = matches.filter((m) => m.source === 'espn' && m.status === 'live' && !m.sources?.length);
  if (!unlinked.length || !channels.length) return matches;

  const exactById = new Map(unlinked.map((m) => [m.id, findMatchFeedChannels(channels, m.title)]));
  const needsFallback = unlinked.some((m) => !exactById.get(m.id)?.length);
  const fallback = needsFallback ? await selectActiveFeedChannels(channels) : [];

  return matches.map((match) => {
    const exact = exactById.get(match.id);
    if (!exact) return match;
    const selected = exact.length ? exact : fallback;
    return selected.length
      ? { ...match, feedStreamCount: selected.length, feedStreamIsFallback: exact.length === 0 }
      : match;
  });
}

/** Details for a single match — ESPN fixtures and catalogue ids both work. */
export async function getMatchDetails(matchId: string): Promise<Match | null> {
  if (isEspnMatchId(matchId)) {
    const espnMatch = await getEspnMatchById(matchId);
    if (!espnMatch) return null;
    const catalogue = await getMatches().catch(() => [] as Match[]);
    const enriched = catalogue.find((m) => m.id === matchId);
    return enriched
      ? {
          ...espnMatch,
          sources: enriched.sources,
          fallbackChannels: enriched.fallbackChannels,
          feedStreamCount: enriched.feedStreamCount,
          feedStreamIsFallback: enriched.feedStreamIsFallback,
        }
      : espnMatch;
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

    // An ESPN-live fixture without a matching M3U event can still try the top
    // active channels. Add them *after* any match-specific provider servers as
    // clearly labelled backups, not as a claim that they carry this fixture.
    if (isEspnMatchId(matchId) && preFetchedMatch?.status === 'live' &&
        !allServers.some((server) => server.provider === 'livefeed')) {
      try {
        const backups = await selectActiveFeedChannels(await getLiveChannels());
        allServers.push(...backups.map((ch) => ({
          name: ch.name,
          url: ch.url,
          proxiedUrl: toPlaybackUrl(ch),
          provider: 'livefeed-fallback',
          quality: 'SD',
        })));
      } catch (err) {
        logger.warn('Live channel backups unavailable', { matchId, error: String(err) });
      }
    }

    if (allServers.length === 0) {
      throw new Error('No streams available from any provider');
    }

    const qualityOrder: Record<string, number> = { 'FHD': 0, 'HD': 0, '1080p': 0, '720p': 1, 'SD': 2 };
    allServers.sort((a, b) => (qualityOrder[a.quality || 'SD'] ?? 2) - (qualityOrder[b.quality || 'SD'] ?? 2));

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
          url: server.provider?.startsWith('livefeed') ? proxiedUrl : server.url,
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
