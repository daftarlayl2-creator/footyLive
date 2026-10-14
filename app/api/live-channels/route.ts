/**
 * GET /api/live-channels
 *
 * Lists the live channels from the configured M3U/JSON feeds together with a
 * per-channel status (`live` | `offline` | `checking` | `unknown`). Playback
 * URLs are deliberately not included: the player page resolves them to signed
 * `/api/proxy` links server-side.
 */
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { getLiveChannels } from '@/lib/broadcast/feeds';
import { getChannelStatuses } from '@/lib/broadcast/probe';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checkedAt = Date.now();
  let channels;
  try {
    channels = await getLiveChannels();
  } catch (err: any) {
    logger.error('Live channels unavailable', err);
    return NextResponse.json(
      { channels: [], checkedAt, error: 'Live feeds are unavailable right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const statuses = await getChannelStatuses(channels);

  return NextResponse.json(
    {
      checkedAt,
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        group: ch.group || '',
        logo: ch.logo || '',
        source: ch.source,
        status: statuses[ch.id] ?? 'unknown',
        href: `/channel/${ch.id}`,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
