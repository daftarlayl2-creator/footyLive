import { parseSafeUpstreamUrl, verifyProxySignature } from '@/lib/hlsProxy';
import { serverKey } from '@/lib/player/servers';
import { rankStreams, type StreamHealth } from '@/lib/player/health';
import type { Channel } from '@/lib/types';
import { getChannelHealth } from './probe';

/** Only application-signed proxy links can be probed; arbitrary URLs are refused. */
export function playbackProbeTarget(playbackUrl: string, now = Date.now()): { id: string; url: string; referer?: string } | null {
  if (!playbackUrl.startsWith('/api/proxy?')) return null;
  const params = new URLSearchParams(playbackUrl.slice('/api/proxy?'.length));
  const url = params.get('url') || '';
  const referer = params.get('ref') || '';
  const expiresAt = Number(params.get('exp'));
  if (expiresAt <= now || !verifyProxySignature(url, referer, expiresAt, params.get('sig') || '', params.has('maxHeight') ? Number(params.get('maxHeight')) : undefined) || !parseSafeUpstreamUrl(url)) return null;
  return { id: serverKey(playbackUrl), url, referer };
}

export async function getPlaybackHealth(urls: string[]): Promise<Record<string, StreamHealth>> {
  const targets = urls.map((url) => playbackProbeTarget(url)).filter((target) => target !== null);
  return getChannelHealth(targets, { limit: 12, verifyMedia: true });
}

/** Used on initial match/channel resolution; later refreshes use /api/stream-health. */
export async function rankChannelsByHealth(channels: Channel[]): Promise<Channel[]> {
  const urls = channels.map((channel) => channel.proxiedUrl || channel.url).filter((url) => url.startsWith('/api/proxy?'));
  const health = await getPlaybackHealth(urls.slice(0, 12));
  return rankStreams(channels.map((channel) => ({ ...channel, health: health[serverKey(channel.proxiedUrl || channel.url)] ?? channel.health })));
}
