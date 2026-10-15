import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/http/requestOrigin';
import { AUTH_HANDOFF_COOKIE, validAuthTokens } from '@/lib/auth/return';

export const dynamic = 'force-dynamic';

/** Same-origin, single-use handoff. The browser validates the tokens with GoTrue. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request, true)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const raw = request.cookies.get(AUTH_HANDOFF_COOKIE)?.value;
  let tokens: unknown = null;
  try {
    if (raw && raw.length <= 3800) tokens = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    // Corrupt, missing or expired cookies fall back to the sign-in panel.
  }
  const valid = validAuthTokens(tokens);
  const response = NextResponse.json(valid ? { tokens } : { error: 'The sign-in session is missing or expired.' }, {
    status: valid ? 200 : 401,
    headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' },
  });
  response.cookies.set(AUTH_HANDOFF_COOKIE, '', { path: '/auth', maxAge: 0, httpOnly: true });
  return response;
}
