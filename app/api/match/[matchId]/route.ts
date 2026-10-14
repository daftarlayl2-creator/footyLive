/**
 * GET /api/match/{matchId}
 *
 * Real-time scoreboard payload for one match: score, minute, cards, scorers and
 * live incidents. Served from the upstream scoreboard cache, so polling this
 * endpoint every 30s never hammers the source.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMatchDetails } from '@/lib/streamEngine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  try {
    const match = await getMatchDetails(matchId);
    if (!match) {
      return NextResponse.json({ match: null }, { status: 404 });
    }

    const dateStr = new Date(match.timestamp).toLocaleDateString([], {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const timeStr = new Date(match.timestamp).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });

    return NextResponse.json(
      {
        match: {
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          currentMinute: match.currentMinute,
          currentMinuteNumber: match.currentMinuteNumber,
          homeName: match.homeTeam?.name,
          awayName: match.awayTeam?.name,
          homeBadge: match.homeTeam?.badge,
          awayBadge: match.awayTeam?.badge,
          tournament: match.tournament,
          leagueLogo: match.leagueLogo,
          venue: match.venue,
          note: match.note,
          source: match.source || 'unknown',
          // Real live incidents parsed from the upstream scoreboard.
          cards: match.live?.cards ?? null,
          scorers: match.live?.scorers ?? null,
          events: (match.live?.events ?? []).slice(-12),
          period: match.live?.period || '',
          dateStr,
          timeStr,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json({ error: 'Unable to load match data. Please try again.' }, { status: 500 });
  }
}
