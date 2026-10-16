/** Apply access AFTER the shared resolver cache: one visitor's VIP URLs must never leak to another. */
import { buildProxyUrl, PROXY_LINK_TTL_MS, verifyProxySignature } from '@/lib/hlsProxy';
import { detectStreamKind, normalizeQuality } from '@/lib/player/servers';
import { slotMap, type MultiStreamSlotId } from '@/lib/player/multiStream';
import { inferStreamQuality } from '@/lib/broadcast/matching';
import type { Channel } from '@/lib/types';
import type { PlaybackAccess } from './plans';

export function preparePlayback(channels: Channel[], access: PlaybackAccess, now = Date.now()) {
  let lockedCount = 0;
  const streams = channels.flatMap((channel): Channel[] => {
    if (channel.health?.status === 'offline') return [];
    const link = channel.proxiedUrl || channel.url;
    const kind = channel.kind || detectStreamKind(link);
    const quality = inferStreamQuality(channel.quality, channel.name);
    if (access.tier === 'free' && (['FHD', '4K'].includes(normalizeQuality(channel.quality)) || ['FHD', '4K'].includes(quality))) { lockedCount++; return []; }
    // Limon cannot remove ads from someone else's iframe player. VIP uses native media only.
    if (access.adFree && kind === 'embed') return [];
    if (!link.startsWith('/api/proxy?')) return [{ ...channel, url: link, proxiedUrl: link }];
    const params = new URLSearchParams(link.slice('/api/proxy?'.length));
    const url = params.get('url') || '';
    const referer = params.get('ref') || '';
    const previousHeight = params.has('maxHeight') ? Number(params.get('maxHeight')) : undefined;
    if (!verifyProxySignature(url, referer, Number(params.get('exp')), params.get('sig') || '', previousHeight)) return [];
    const expiresAt = Math.min(now + PROXY_LINK_TTL_MS, access.expiresAt ?? Infinity);
    const protectedUrl = buildProxyUrl(url, { referer, expiresAt, maxHeight: access.maxHeight });
    return [{ ...channel, url: protectedUrl, proxiedUrl: protectedUrl }];
  });
  return {
    streams,
    defaultUrl: streams[0]?.proxiedUrl || streams[0]?.url || null,
    // Named multi-server fallback slots (stream1/2/3): the player and Multi-View
    // switch between them seamlessly when one returns 404/500 or fails to load.
    ...slotMap(streams),
    lockedCount,
  };
}

export type PlaybackPayload = ReturnType<typeof preparePlayback> & Record<MultiStreamSlotId, string | null>;
