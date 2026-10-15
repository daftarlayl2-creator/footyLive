import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails, resolveAllStreams } from '@/lib/streamEngine';
import { detectStreamKind } from '@/lib/player/servers';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  try {
    const match = await getMatchDetails(matchId);
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
    return NextResponse.json(
      { error: 'Streams are temporarily unavailable. Please try again.' },
      { status: 503, headers }
    );
  }
}
