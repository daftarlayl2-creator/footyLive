/**
 * GET /api/live-channels
 *
 * Lists the live channels from the configured M3U/JSON feeds together with a
 * per-channel status:
 *   `live`     → the probe confirmed media
 *   `unknown`  → the probe was blocked / could not be verified (shown as
 *                "Standby" and still fully playable)
 *   `offline`  → the upstream answered 404/410 or served a non-media body
 *   `checking` → the probe is still running
 *
 * The list is always returned, even when every probe is blocked, because
 * playback is only ever attempted through the signed `/api/proxy` route.
 * Playback URLs are deliberately not included here: the player page resolves
 * them server-side.
 */
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { getLiveChannels, getStaticFallbackChannels } from '@/lib/broadcast/feeds';
import { getChannelHealth } from '@/lib/broadcast/probe';
import { browsableChannels } from '@/lib/broadcast/pool';
import { inferStreamQuality } from '@/lib/broadcast/matching';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const checkedAt = Date.now();
  const probeParam = new URL(request.url).searchParams.get('probe');
  const probe = probeParam !== '0';

  // `getLiveChannels` never throws (memory cache → GitHub Contents API →
  // last-known-good → static standby channels); the catch is a final guard so
  // the response still lists channels instead of an error.
  let channels;
  try {
    channels = await getLiveChannels();
  } catch (err: any) {
    logger.error('Live channels unavailable', err);
    channels = getStaticFallbackChannels();
  }

  channels = browsableChannels(channels);
  const health = probe ? await getChannelHealth(channels) : {};
  const payload = channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    group: ch.group || '',
    logo: ch.logo || '',
    source: ch.source,
    status: health[ch.id]?.status ?? 'unknown',
    health: health[ch.id],
    quality: ch.quality || inferStreamQuality(ch.name, ch.tvgId, ...(ch.tags ?? [])),
    // Every channel is playable through the proxy regardless of probe state.
    href: `/channel/${ch.id}`,
    playable: true,
  }));

  return NextResponse.json(
    {
      checkedAt,
      probed: probe,
      channels: payload,
      counts: payload.reduce(
        (acc, ch) => {
          if (ch.status === 'live') acc.live += 1;
          else if (ch.status === 'offline') acc.offline += 1;
          else acc.standby += 1;
          acc.total += 1;
          return acc;
        },
        { live: 0, standby: 0, offline: 0, total: 0 }
      ),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
