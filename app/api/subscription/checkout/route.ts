import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest, requestOrigin } from '@/lib/http/requestOrigin';
import { getPlan, validMatchId } from '@/lib/subscription/plans';
import { billingConfigured, createCheckout, verifyViewer, VIEWER_COOKIE, VIEWER_COOKIE_AGE_S } from '@/lib/subscription/server';
import { getMatchDetails } from '@/lib/streamEngine';

export const dynamic = 'force-dynamic';
class RequestTooLarge extends Error {}
async function checkoutBody(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 2048) throw new RequestTooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing JSON');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw new RequestTooLarge();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const headers = { 'Cache-Control': 'no-store, private' };
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request, true)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try {
    const body = await checkoutBody(request);
    const plan = getPlan(body?.planId);
    if (!plan || (plan.scope === 'match' && !validMatchId(body.matchId))) return NextResponse.json({ error: 'Choose a valid pass and select a fixture for a Single Match Pass.' }, { status: 400, headers });
    if (!billingConfigured()) return NextResponse.json({ error: 'Checkout is not configured yet. No payment has been taken.' }, { status: 503, headers });
    if (plan.scope === 'match') {
      const match = await getMatchDetails(body.matchId);
      if (!match || match.status === 'finished') return NextResponse.json({ error: 'Choose an upcoming or live fixture for this pass.' }, { status: 400, headers });
    }
    const purchaseCookie = request.cookies.get(VIEWER_COOKIE)?.value;
    const existing = verifyViewer(purchaseCookie);
    if (!existing) return NextResponse.json({ error: 'Enable cookies and refresh the pass status before checkout.' }, { status: 409, headers });
    const response = NextResponse.json({ checkoutUrl: await createCheckout(existing, plan.id, requestOrigin(request), plan.scope === 'match' ? body.matchId : undefined) }, { headers });
    // Keep the *same* customer identity, with enough cookie life for a new annual pass.
    response.cookies.set(VIEWER_COOKIE, purchaseCookie!, { httpOnly: true, secure: requestOrigin(request).startsWith('https:'), sameSite: 'lax', path: '/', maxAge: VIEWER_COOKIE_AGE_S });
    return response;
  } catch (err) {
    if (err instanceof RequestTooLarge) return NextResponse.json({ error: 'Request too large.' }, { status: 413, headers });
    if (err instanceof SyntaxError) return NextResponse.json({ error: 'Invalid checkout request.' }, { status: 400, headers });
    return NextResponse.json({ error: 'Checkout is temporarily unavailable. No pass has been activated. Please try again.' }, { status: 503, headers });
  }
}
