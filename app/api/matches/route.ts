import { NextRequest, NextResponse } from 'next/server';
import { catalogMatch } from '@/lib/subscription/catalog';
import { getMatches } from '@/lib/streamEngine';
import { isVisibleMatch } from '@/lib/match/visible';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // live data — never serve a stale static payload

export async function GET(request: NextRequest) {
  try {
    const allMatches = await getMatches();

    // Same selection rules as the homepage (lib/match/visible): finished
    // results stay visible while the provider returns them, stale upcoming
    // rows are dropped instead of being shown as live.
    const visible = allMatches.filter((match) => isVisibleMatch(match));

    // Sort matches: live first, then priority, then timestamp
    const sorted = [...visible].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.timestamp - b.timestamp;
    });

    return NextResponse.json({ matches: sorted.map(catalogMatch) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { error: 'Fixtures are temporarily unavailable. Please try again.' },
      { status: 500 }
    );
  }
}
