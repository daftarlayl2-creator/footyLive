import { NextResponse } from 'next/server';
import { getHighlights } from '@/lib/providers/highlights';

export const dynamic = 'force-dynamic';

/**
 * Recent highlights (ScoreBat v3). The provider enforces a 3-second deadline
 * and degrades to an empty list, so this route always answers quickly and the
 * client can show a clean "No recent highlights" fallback.
 */
export async function GET() {
  const highlights = await getHighlights();
  return NextResponse.json(
    { highlights },
    {
      headers: {
        'Cache-Control': highlights.length ? 'public, s-maxage=900' : 'public, s-maxage=60',
      },
    }
  );
}
