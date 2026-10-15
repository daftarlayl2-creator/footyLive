import { Match, Channel } from '../types';
import { StreamProvider } from './types';
import { fetchWithTimeout } from './baseProvider';
import { matchChannelScore } from '../broadcast/matching';
import { getCacheManager } from '../cache/cacheManager';
import logger from '../logger';

const CDN_LIVE_API = 'https://api.cdnlivetv.tv/api/v1/events/sports/?user=cdnlivetv&plan=free';
const TIMEOUT_MS = 4000;

interface CdnliveRawMatch {
  gameID: string;
  homeTeam: string;
  awayTeam: string;
  tournament: string;
  country: string;
  status: string;
  start: string;
  channels: { channel_name: string; url: string }[];
}

export class CdnLiveProvider implements StreamProvider {
  id = 'cdnlive';
  name = 'CDNLiveTV';

  private async fetchRawMatches(): Promise<CdnliveRawMatch[]> {
    const cache = getCacheManager();
    return cache.swr('cdnlive_raw', async () => {
      try {
        const data = await fetchWithTimeout(CDN_LIVE_API, TIMEOUT_MS);
        const sportsData = data?.['cdn-live-tv'] || {};
        const soccerEvents = sportsData['Soccer'] || sportsData['Football'] || [];
        return Array.isArray(soccerEvents) ? soccerEvents : [];
      } catch (err) {
        logger.error('CDNLiveTV API request failed', err);
        return [];
      }
    }, 30);
  }

  async fetchMatches(): Promise<Match[]> {
    // CDNLive events are not surfaced as top-level listings,
    // they are resolved dynamically as fallback channels.
    return [];
  }

  async resolveStreams(
    matchTitle: string,
    homeTeam: string,
    awayTeam: string,
    matchId: string,
    preFetchedMatch?: Match | null
  ): Promise<Channel[]> {
    try {
      const events = await this.fetchRawMatches();
      const channels: Channel[] = [];
      
      for (const event of events) {
        const eventTitle = `${event.homeTeam || ''} vs ${event.awayTeam || ''}`;
        if (matchChannelScore(matchTitle, { name: eventTitle }, homeTeam, awayTeam) > 0) {
          const eventChannels = event.channels || [];
          eventChannels.forEach((ch, idx) => {
            if (ch.url) {
              channels.push({
                name: ch.channel_name || `Stream ${idx + 1}`,
                url: ch.url,
                provider: this.id,
                quality: 'HD',
              });
            }
          });
        }
      }
      return channels;
    } catch (err) {
      logger.error('CDNLive streams resolution failed', err, { matchTitle });
      return [];
    }
  }
}
