/**
 * GET /api/standings?league={slug}
 *
 * Official league table plus top scorers and top assists for one league
 * (`eng.1`, `esp.1`, `ita.1`, `ger.1`, `fra.1`, `uefa.champions`, `mar.1`, …).
 */
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_STANDINGS_LEAGUE, STANDINGS_LEAGUES, findStandingsLeague } from '@/lib/standings';
import { getStandingsBundle } from '@/lib/providers/standingsProvider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('league') || DEFAULT_STANDINGS_LEAGUE;
  const league = findStandingsLeague(requested);
  if (!league) {
    return NextResponse.json(
      { error: `Unknown league "${requested}"`, leagues: STANDINGS_LEAGUES.map((l) => l.slug) },
      { status: 400 }
    );
  }

  try {
    const bundle = await getStandingsBundle(league.slug);
    return NextResponse.json(bundle, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json(
      { error: `${league.name} standings are temporarily unavailable. Please try again shortly.` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
