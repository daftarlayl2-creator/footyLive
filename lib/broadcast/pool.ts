/** Hidden server-side channel index. A playlist is not a menu or a fixture catalogue. */
import { getLiveChannels } from './feeds';
import { isGuovinFeed, isIptvOrgFeed } from './sources';
import type { LiveChannel } from './types';

export const isBackgroundChannel = (channel: Pick<LiveChannel, 'feedUrl'>): boolean => isGuovinFeed(channel.feedUrl) || isIptvOrgFeed(channel.feedUrl);
export function browsableChannels(channels: LiveChannel[]): LiveChannel[] { return channels.filter((channel) => !isBackgroundChannel(channel)); }
const indexes = new WeakMap<LiveChannel[], Map<string, LiveChannel[]>>();

export function channelIndex(channels: LiveChannel[]): Map<string, LiveChannel[]> {
  const existing = indexes.get(channels);
  if (existing) return existing;
  const index = new Map<string, LiveChannel[]>();
  for (const channel of channels) {
    if (!channel.tvgId) continue;
    const bucket = index.get(channel.tvgId) || [];
    bucket.push(channel);
    index.set(channel.tvgId, bucket);
  }
  indexes.set(channels, index);
  return index;
}
export async function getBackgroundPool() {
  const channels = await getLiveChannels();
  return { channels, byTvgId: channelIndex(channels) };
}
