import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest, requestOrigin } from '@/lib/http/requestOrigin';
import { billingConfigured, createViewer, getRequestSubscription, verifyViewer, VIEWER_COOKIE, VIEWER_COOKIE_AGE_S } from '@/lib/subscription/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
export async function GET(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  try {
    const viewer = verifyViewer(request.cookies.get(VIEWER_COOKIE)?.value);
    // Paid grants are only half the story: a Rewards Store redemption and an
    // admin tier assignment are server-side entitlements as well, so the header,
    // the paywall and the tier badge light up the second either one lands.
    const merged = await getRequestSubscription(request);
    if (merged.unavailable) {
      return NextResponse.json({ error: 'Pass verification is temporarily unavailable. Please refresh shortly.' }, { status: 503, headers });
    }
    const response = NextResponse.json(
      { grants: merged.grants, checkoutAvailable: billingConfigured(), unavailable: false, coinGrants: merged.coinGrants },
      { headers }
    );
    if (billingConfigured() && !viewer) response.cookies.set(VIEWER_COOKIE, createViewer().cookie, {
      httpOnly: true, secure: requestOrigin(request).startsWith('https:'), sameSite: 'lax', path: '/', maxAge: VIEWER_COOKIE_AGE_S,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Pass verification is temporarily unavailable. Please refresh shortly.' }, { status: 503, headers });
  }
}
