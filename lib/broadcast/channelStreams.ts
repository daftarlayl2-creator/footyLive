import { getChannelSources, toPlaybackUrl } from './feeds';
import { inferStreamQuality } from './matching';
import { rankChannelsByHealth } from './streamHealth';
import { detectStreamKind } from '@/lib/player/servers';
import { getChannelHealth } from './probe';
import { isIptvOrgFeed, isGuovinFeed } from './sources';
import { regionalMetadata } from './mena';
import { freshHealth, type StreamHealth } from '@/lib/player/health';

/** Channel page and quad-view tiles use the same signed, health-ranked sources. */
export async function resolveChannelStreams(id: string) {
  if (!/^[a-f0-9]{16}(-\d+)?$/.test(id)) return null;
  const sources = await getChannelSources(id);
  if (!sources.length) return null;
  const official = sources.filter((source) => (isIptvOrgFeed(source.feedUrl) || isGuovinFeed(source.feedUrl)));
  const health: Record<string, StreamHealth> = official.length ? await getChannelHealth(official, { limit: 8, verifyMedia: true }) : {};
  // Keep a manually chosen channel available even if its probe is blocked.
  // Its automatically added official siblings must pass the stronger check.
  const eligible = sources.filter((source) => {
    const result = freshHealth(health[source.id]);
    return source.id === id || !(isIptvOrgFeed(source.feedUrl) || isGuovinFeed(source.feedUrl)) || (result?.status === 'live' && result.mediaVerified === true && result.samples > 0);
  });
  const streams = await rankChannelsByHealth(eligible.map((source) => {
    const url = toPlaybackUrl(source);
    return { ...regionalMetadata(source.tvgId), name: source.name, url, proxiedUrl: url, provider: (isIptvOrgFeed(source.feedUrl) || isGuovinFeed(source.feedUrl)) ? 'iptv-org-channel' : 'livefeed',
      health: health[source.id],
      quality: source.quality || inferStreamQuality(source.name, source.tvgId, ...(source.tags ?? [])),
      kind: detectStreamKind(url) ?? 'hls' };
  }));
  return { channel: sources[0], streams, defaultUrl: streams[0].proxiedUrl || streams[0].url, matchTitle: sources[0].name, matchStatus: 'live' };
}
