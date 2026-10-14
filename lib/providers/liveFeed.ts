import { Channel } from '../types';
import { StreamProvider } from './types';
import { teamsMatch } from '../utils/matching';
import { getLiveChannels, toPlaybackUrl } from '../broadcast/feeds';

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
    _homeTeam: string,
    _awayTeam: string,
    _matchId: string
  ): Promise<Channel[]> {
    const channels = await getLiveChannels();
    return channels
      .filter((ch) => teamsMatch(matchTitle, ch.name))
      .map((ch) => ({
        name: ch.name,
        url: ch.url,
        proxiedUrl: toPlaybackUrl(ch),
        provider: this.id,
        quality: 'HD',
      }));
  }
}
