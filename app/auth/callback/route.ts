import { NextRequest, NextResponse } from 'next/server';
import { requestOrigin } from '@/lib/http/requestOrigin';
import { getSupabaseCredentials } from '@/lib/supabase/client';
import { createSupabaseAuth } from '@/lib/auth/supabaseAuth';
import {
  AUTH_HANDOFF_COOKIE, AUTH_HANDOFF_TTL_S, AUTH_VERIFIER_COOKIE,
  callbackFailureReason, type AuthReturnReason,
} from '@/lib/auth/return';

export const dynamic = 'force-dynamic';
const EMAIL_TYPES = new Set(['email', 'signup', 'invite', 'magiclink', 'email_change']);

/** Always return to our profile, never to a caller-controlled `next` URL. */
function profileRedirect(request: NextRequest, reason?: AuthReturnReason) {
  const target = new URL('/profile', requestOrigin(request));
  target.searchParams.set('auth', reason ? 'error' : 'complete');
  if (reason) target.searchParams.set('reason', reason);
  const response = NextResponse.redirect(target, 303);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Referrer-Policy', 'no-referrer');
  const expired = { path: '/auth', maxAge: 0, secure: requestOrigin(request).startsWith('https:'), sameSite: 'lax' as const };
  response.cookies.set(AUTH_VERIFIER_COOKIE, '', expired);
  response.cookies.set(AUTH_HANDOFF_COOKIE, '', { ...expired, httpOnly: true });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // A Location without a fragment preserves implicit-flow #access_token=… in
  // browsers. /profile consumes and immediately scrubs that legacy fragment.
  if (params.has('error') || params.has('error_code')) {
    return profileRedirect(request, callbackFailureReason(params.get('error_code') || params.get('error') || ''));
  }
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  if (!code && !tokenHash) return profileRedirect(request, 'missing');
  if (code && tokenHash) return profileRedirect(request, 'invalid');
  if ((code?.length || 0) > 4096 || (tokenHash?.length || 0) > 4096) return profileRedirect(request, 'invalid');

  const credentials = getSupabaseCredentials();
  if (!credentials) return profileRedirect(request, 'unavailable');
  const supabase = createSupabaseAuth(credentials);

  try {
    let result;
    if (code) {
      const verifier = request.cookies.get(AUTH_VERIFIER_COOKIE)?.value || '';
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return profileRedirect(request, 'verifier');
      result = await supabase.exchangeCodeForSession(code, verifier);
    } else {
      const type = params.get('type') || 'email';
      if (!EMAIL_TYPES.has(type)) return profileRedirect(request, 'invalid');
      result = await supabase.verifyOtp(tokenHash!, type);
    }
    if (!result.ok) return profileRedirect(request, callbackFailureReason(result.code, result.status));

    // Short-lived, HttpOnly handoff to the existing browser-local auth store.
    // No access/refresh token is ever put in the redirect URL or HTML.
    const { accessToken, refreshToken, expiresAt } = result.session;
    const handoff = Buffer.from(JSON.stringify({ accessToken, refreshToken, expiresAt })).toString('base64url');
    if (handoff.length > 3800) return profileRedirect(request, 'invalid');
    const response = profileRedirect(request);
    response.cookies.set(AUTH_HANDOFF_COOKIE, handoff, {
      httpOnly: true, secure: requestOrigin(request).startsWith('https:'),
      sameSite: 'lax', path: '/auth', maxAge: AUTH_HANDOFF_TTL_S,
    });
    return response;
  } catch {
    return profileRedirect(request, 'unavailable');
  }
}
