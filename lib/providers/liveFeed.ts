import { Channel } from '../types';
import { StreamProvider } from './types';
import { inferStreamQuality, matchChannelScore } from '../broadcast/matching';
import { getLiveChannels, toPlaybackUrl } from '../broadcast/feeds';
import type { LiveChannel } from '../broadcast/types';
import { isIptvOrgFeed } from '../broadcast/sources';

/** Only confident two-team title matches are treated as match-specific. */
export function findMatchFeedChannels(channels: LiveChannel[], matchTitle: string, homeTeam?: string, awayTeam?: string): LiveChannel[] {
  return channels.filter((channel) => !isIptvOrgFeed(channel.feedUrl)).map((channel, index) => ({ channel, index, score: matchChannelScore(matchTitle, channel, homeTeam, awayTeam) }))
    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(({ channel }) => channel);
}

// Generic (non-fixture) backups for live matches are mapped across every feed
// family — Live-events, IPTV-Org and Guovin — in `lib/broadcast/backups.ts`.

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
