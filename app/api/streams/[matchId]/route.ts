import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails, resolveAllStreams } from '@/lib/streamEngine';
import { detectStreamKind } from '@/lib/player/servers';

export const revalidate = 15; // stream links change less frequently, 15s is safe

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  try {
    const match = await getMatchDetails(matchId);
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
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
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to resolve stream routes: ' + err.message },
      { status: 500 }
    );
  }
}
