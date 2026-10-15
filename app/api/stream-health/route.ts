import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/http/requestOrigin';
import { getPlaybackHealth, playbackProbeTarget } from '@/lib/broadcast/streamHealth';
import { MAX_HEALTH_BATCH } from '@/lib/player/health';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private' };

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  }
  try {
    if (Number(request.headers.get('content-length')) > 65_536) return NextResponse.json({ error: 'Request too large' }, { status: 413, headers });
    const text = await request.text();
    if (text.length > 65_536) return NextResponse.json({ error: 'Request too large' }, { status: 413, headers });
    const body = JSON.parse(text);
    if (!Array.isArray(body.urls) || !body.urls.length || body.urls.length > MAX_HEALTH_BATCH || body.urls.some((url: unknown) => typeof url !== 'string' || !playbackProbeTarget(url))) {
      return NextResponse.json({ error: 'Provide up to 12 valid, unexpired signed stream links.' }, { status: 400, headers });
    }
    return NextResponse.json({ health: await getPlaybackHealth([...new Set<string>(body.urls)]) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to check stream health.' }, { status: 400, headers });
  }
}
