import { NextResponse } from 'next/server';
import { resolveChannelStreams } from '@/lib/broadcast/channelStreams';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const resolved = await resolveChannelStreams(id);
    if (!resolved) return NextResponse.json({ error: 'Channel not found in the current feeds.' }, { status: 404, headers });
    // Do not serialize the feed entry, which includes the raw upstream URL.
    return NextResponse.json({ streams: resolved.streams, defaultUrl: resolved.defaultUrl, matchTitle: resolved.matchTitle, matchStatus: 'live' }, { headers });
  } catch {
    return NextResponse.json({ error: 'Channel streams are temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
