import { Channel } from '../types';
import { StreamProvider } from './types';
import { inferStreamQuality, matchChannelScore } from '../broadcast/matching';
import { getLiveChannels, toPlaybackUrl } from '../broadcast/feeds';
import { getChannelStatuses } from '../broadcast/probe';
import type { ChannelStatus, LiveChannel } from '../broadcast/types';
import logger from '../logger';
import { isIptvOrgFeed } from '../broadcast/sources';

/** Only confident two-team title matches are treated as match-specific. */
export function findMatchFeedChannels(channels: LiveChannel[], matchTitle: string, homeTeam?: string, awayTeam?: string): LiveChannel[] {
  return channels.filter((channel) => !isIptvOrgFeed(channel.feedUrl)).map((channel, index) => ({ channel, index, score: matchChannelScore(matchTitle, channel, homeTeam, awayTeam) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(({ channel }) => channel);
}

export const MAX_MATCH_FALLBACK_SERVERS = 3;
const MAX_MATCH_FALLBACK_PROBES = 24;

/**
 * When there is no match-specific listing for a LIVE ESPN fixture, offer the
 * first football channels whose probes confirmed media, then channels the
 * CDN would not let us verify. Never offer a known-offline channel or a promo.
 * Unverified channels are marked as such in the match UI; they may not carry
 * the fixture, and playback still has to succeed through the signed proxy.
 */
export async function selectActiveFeedChannels(channels: LiveChannel[]): Promise<LiveChannel[]> {
  const legacy = channels.filter((channel) => !isIptvOrgFeed(channel.feedUrl));
  const football = legacy.filter((ch) => !ch.group || /football|soccer|كرة القدم/i.test(ch.group));
  const eligible = football.length ? football : legacy;
  const candidates = eligible.slice(0, MAX_MATCH_FALLBACK_PROBES);
  if (!candidates.length) return [];
  let statuses: Record<string, ChannelStatus> = {};
  try {
    statuses = await getChannelStatuses(candidates, { limit: MAX_MATCH_FALLBACK_PROBES });
  } catch (err) {
    // A failed status service should not hide channels; they remain unverified.
    logger.warn('Could not verify live feed backups', { error: String(err) });
  }
  const live = candidates.filter((ch) => statuses[ch.id] === 'live');
  const unverified = candidates.filter((ch) => statuses[ch.id] !== 'live' && statuses[ch.id] !== 'offline');
  return [...live, ...unverified].slice(0, MAX_MATCH_FALLBACK_SERVERS);
}

/**
 * Match-level stream source backed by the dynamic live feeds (M3U / JSON).
 * A feed entry whose title names both teams of a fixture becomes a server
 * for that fixture, routed through `/api/proxy`.
 */
export class LiveFeedProvider implements StreamProvider {
  id = 'livefeed';
  name = 'Live feeds';

  async fetchMatches() {
    // Feed entries are not fixtures; they only enrich existing matches.
    return [];
  }

  async resolveStreams(
    matchTitle: string,
    homeTeam: string,
    awayTeam: string,
    _matchId: string
  ): Promise<Channel[]> {
    const channels = await getLiveChannels();
    return findMatchFeedChannels(channels, matchTitle, homeTeam, awayTeam)
      .map((ch) => ({
        name: ch.name,
        url: ch.url,
        proxiedUrl: toPlaybackUrl(ch),
        provider: this.id,
        quality: ch.quality || inferStreamQuality(ch.name, ch.tvgId, ...(ch.tags ?? [])),
      }));
  }
}
