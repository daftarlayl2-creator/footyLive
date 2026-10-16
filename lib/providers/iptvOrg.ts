import type { Channel, Match } from '../types';
import type { StreamProvider } from './types';
import { getLiveChannels, toPlaybackUrl } from '../broadcast/feeds';
import { inferStreamQuality } from '../broadcast/matching';
import { regionalMetadata } from '../broadcast/mena';
import { selectVerifiedIptvOrgChannels } from '../broadcast/iptvOrg';

/**
 * Official sports channels enrich fixtures; they never invent fixtures/rights.
 * This provider maps media-verified two-team listings only — broadcaster and
 * general sports backups for live fixtures are selected together with the
 * other feed families by `selectLiveBackups` (lib/broadcast/backups.ts).
 */
export class IptvOrgProvider implements StreamProvider {
  id = 'iptv-org';
  name = 'IPTV-Org Sports';
  async fetchMatches(): Promise<Match[]> { return []; }

  async resolveStreams(title: string, homeTeam: string, awayTeam: string, _matchId: string, fixture: Match | null = null): Promise<Channel[]> {
    const selected = await selectVerifiedIptvOrgChannels(await getLiveChannels(), {
      title, homeTeam: { name: homeTeam }, awayTeam: { name: awayTeam }, broadcasters: fixture?.broadcasters,
    }, { allowFallback: false });
    return selected.map(({ channel, coverage, health }) => ({
      name: channel.name, url: channel.url, proxiedUrl: toPlaybackUrl(channel),
      provider: coverage === 'fixture' ? this.id : `${this.id}-fallback-${coverage}`,
      ...regionalMetadata(channel.tvgId),
      coverage, health, quality: inferStreamQuality(channel.name, channel.quality, channel.tvgId),
    }));
  }
}
