import { NextResponse } from 'next/server';
import { isLiveTvEnabled } from '@/lib/config/features';
import { getRequestSubscription } from '@/lib/subscription/server';
import { subscriptionAccess } from '@/lib/subscription/plans';
import { preparePlayback } from '@/lib/subscription/playback';
import { resolveChannelStreams } from '@/lib/broadcast/channelStreams';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Live TV temporarily hidden: no channel stream resolution.
  if (!isLiveTvEnabled()) return NextResponse.json({ error: 'Live TV is temporarily unavailable.' }, { status: 404, headers });
  const { id } = await params;
  try {
    const access = subscriptionAccess((await getRequestSubscription(request)).grants);
    if (new URL(request.url).searchParams.get('multiview') === '1' && !access.multiView) return NextResponse.json({ error: 'A site-wide VIP pass is required for Multi-View.' }, { status: 403, headers });
    const resolved = await resolveChannelStreams(id);
    if (!resolved) return NextResponse.json({ error: 'Channel not found in the current feeds.' }, { status: 404, headers });
    // Do not serialize the feed entry, which includes the raw upstream URL.
    return NextResponse.json({ ...preparePlayback(resolved.streams, access), matchTitle: resolved.matchTitle, matchStatus: 'live' }, { headers });
  } catch {
    return NextResponse.json({ error: 'Channel streams are temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
