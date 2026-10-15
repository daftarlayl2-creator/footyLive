import { NextResponse } from 'next/server';
import { getHighlights } from '@/lib/providers/highlights';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const highlights = await getHighlights();
    return NextResponse.json({ highlights }, { headers: { 'Cache-Control': 'public, s-maxage=900' } });
  } catch (err) {
    return NextResponse.json({ highlights: [], error: String(err) }, { status: 502 });
  }
}
