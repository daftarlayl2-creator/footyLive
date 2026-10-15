import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails, resolveAllStreams } from '@/lib/streamEngine';
import { detectStreamKind } from '@/lib/player/servers';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
/** Seconds before a client should re-resolve a fixture that has no servers yet. */
const RETRY_AFTER_S = 15;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  let match: Awaited<ReturnType<typeof getMatchDetails>> = null;
  try {
    match = await getMatchDetails(matchId);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404, headers });
    }

    const homeTeam = match.homeTeam?.name || '';
    const awayTeam = match.awayTeam?.name || '';

    const resolved = await resolveAllStreams(match.title, matchId, homeTeam, awayTeam, match);

    return NextResponse.json({
      matchTitle: match.title,
      matchStatus: match.status,
      streams: resolved.channels || [],
      defaultUrl: resolved.proxiedUrl,
      // Proxy links URL-encode the upstream path, so classify by the URL they carry.
      isDirectHls: detectStreamKind(resolved.proxiedUrl) !== 'embed',
    }, { headers });
  } catch {
    // No server answered yet. Live fixtures are re-resolved by the client (each
    // resolution probes a fresh backup window); the status lets it stop at full time.
    return NextResponse.json(
      {
        error: 'Streams are temporarily unavailable. Please try again.',
        streams: [],
        ...(match ? { matchTitle: match.title, matchStatus: match.status } : {}),
        retryAfter: RETRY_AFTER_S,
      },
      { status: 503, headers: { ...headers, 'Retry-After': String(RETRY_AFTER_S) } }
    );
  }
}
