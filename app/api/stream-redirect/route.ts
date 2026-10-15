import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { probeEmbedTarget, refusalPage, verifyStreamRedirect } from '@/lib/streamRedirect';

/**
 * HMAC-validated redirect to an embedded provider player.
 *
 *  - Valid link → 302 to the provider page.
 *  - Valid link + `check=1` → JSON health probe of the provider page
 *    (`{ health: 'ok' | 'offline' | 'unknown' }`), used by the player to fail
 *    over from dead links before the viewer stares at a provider error.
 *  - Refused link → 403/400. Requests from an iframe get a small dark page
 *    (the player detects it and switches server); everything else gets JSON.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const verdict = verifyStreamRedirect(searchParams);
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (!verdict.ok) {
    logger.warn(`Stream redirect refused: ${verdict.reason}`, { ip, expires: searchParams.get('expires') });
    if (request.headers.get('sec-fetch-dest') === 'iframe') {
      return new NextResponse(refusalPage(verdict.error), {
        status: verdict.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  if (searchParams.get('check') === '1') {
    const result = await probeEmbedTarget(verdict.target);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=60' } });
  }

  return NextResponse.redirect(verdict.target, 302);
}
