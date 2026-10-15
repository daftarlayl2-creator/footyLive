/**
 * GET /api/club/{id}
 *
 * `{id}` is an ESPN team id (`359`), id + slug (`359-arsenal`) or a club name
 * slug (`real-madrid`, resolved through ESPN search). Returns the ESPN core
 * (profile, results, fixtures, squad, form) plus Wikipedia/Wikidata facts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ClubDataUnavailableError, getClubCore, getClubFacts, resolveClub, type ClubFacts } from '@/lib/clubs/clubProfile';

export const dynamic = 'force-dynamic';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { espnId, slug } = await resolveClub(id);
    const core = espnId ? await getClubCore(espnId) : null;
    if (!core) {
      return NextResponse.json({ error: `No club found for "${slug || id}"` }, { status: 404 });
    }
    const facts = await withTimeout<ClubFacts>(
      getClubFacts(core.club.name, Boolean(core.club.isNational)),
      5000,
      { summary: null }
    );
    return NextResponse.json(
      {
        ...core,
        facts: { ...facts, stadium: facts.stadium || core.homeVenue },
      },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900' } }
    );
  } catch (err) {
    const outage = err instanceof ClubDataUnavailableError;
    return NextResponse.json(
      { error: 'Club data is temporarily unavailable. Please try again shortly.' },
      { status: outage ? 503 : 502, headers: { 'Cache-Control': 'no-store', ...(outage ? { 'Retry-After': '30' } : {}) } }
    );
  }
}
