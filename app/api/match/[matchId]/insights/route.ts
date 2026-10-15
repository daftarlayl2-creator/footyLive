import { NextResponse } from 'next/server';
import { getMatchDetails } from '@/lib/streamEngine';
import { loadMatchInsights } from '@/lib/predictions/loadMatchInsights';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  try {
    const match = await getMatchDetails(matchId);
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    const insights = await loadMatchInsights(match);
    return NextResponse.json(insights, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch {
    return NextResponse.json({ error: 'Match insights are temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
