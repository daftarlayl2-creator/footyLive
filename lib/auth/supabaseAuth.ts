/**
 * Minimal Supabase Auth (GoTrue) client over fetch — sign-up, password
 * sign-in, token refresh, user metadata updates and avatar uploads to the
 * public `avatars` Storage bucket. Like lib/supabase/client.ts it keeps the
 * SDK out of the bundle, and errors are returned, never thrown.
 */

import { sanitizeAvatarUrl, sanitizeFavoriteClub } from './localAuth';
import type { AuthUser, Credentials, FavoriteClub, SignUpInput } from './types';
import { normalizeEmail, sanitizeDisplayName } from './validation';
import { validAuthTokens, type AuthTokens } from './return';

export const AVATAR_BUCKET = 'avatars';

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  user: AuthUser;
}

export interface GoTrueOptions {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export type GoTrueFailure = { ok: false; error: string; status: number; code?: string };

const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  invalid_grant: 'Wrong email or password.',
  email_not_confirmed: 'Please confirm your email first — check your inbox for the link.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  over_email_send_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  signup_disabled: 'New sign-ups are currently closed.',
};

/** Human message for a GoTrue error payload. */
export function goTrueErrorMessage(json: any, status: number): { message: string; code?: string } {
  const code: string | undefined = json?.error_code || (typeof json?.error === 'string' ? json.error : undefined);
  const raw: string = json?.msg || json?.error_description || json?.message || (typeof json?.error === 'string' ? json.error : '') || '';
  if (code && FRIENDLY_ERRORS[code]) return { message: FRIENDLY_ERRORS[code], code };
  if (/already registered|already exists/i.test(raw)) return { message: FRIENDLY_ERRORS.user_already_exists, code };
  if (/invalid login credentials/i.test(raw)) return { message: FRIENDLY_ERRORS.invalid_credentials, code };
  if (raw) return { message: raw, code };
  if (status === 0) return { message: 'Could not reach the sign-in service. Check your connection and try again.', code };
  return { message: `Sign-in service error (${status}).`, code };
}

/** Maps a GoTrue user object to the app's fan profile. */
export function mapGoTrueUser(raw: any): AuthUser {
  const meta = raw?.user_metadata || {};
  const email = normalizeEmail(raw?.email);
  const displayName = sanitizeDisplayName(meta.display_name || meta.full_name || meta.name || email.split('@')[0] || 'Limon fan') || 'Limon fan';
  const avatar = sanitizeAvatarUrl(typeof meta.avatar_url === 'string' ? meta.avatar_url : null, 0);
  return {
    id: String(raw?.id ?? ''),
    email,
    displayName,
    avatarUrl: avatar ?? null,
    favoriteClub: sanitizeFavoriteClub(meta.favorite_club as FavoriteClub | null),
    verified: Boolean(raw?.email_confirmed_at || raw?.confirmed_at),
    provider: 'supabase',
    createdAt: String(raw?.created_at || new Date(0).toISOString()),
  };
}

export function createSupabaseAuth({ url, anonKey, fetch: fetchImpl, timeoutMs = 10_000, now = () => Date.now() }: GoTrueOptions) {
  const base = url.replace(/\/+$/, '');
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request(
    path: string,
    init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; raw?: BodyInit }
  ): Promise<{ ok: true; status: number; json: any } | GoTrueFailure> {
    const headers: Record<string, string> = { apikey: anonKey, Accept: 'application/json', ...init.headers };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    let body: BodyInit | undefined = init.raw;
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body,
        cache: 'no-store',
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch {
      const { message } = goTrueErrorMessage(null, 0);
      return { ok: false, error: message, status: 0 };
    }
    const text = await response.text().catch(() => '');
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const { message, code } = goTrueErrorMessage(json, response.status);
      return { ok: false, error: message, status: response.status, code };
    }
    return { ok: true, status: response.status, json };
  }

  function sessionFrom(json: any): SupabaseSession | null {
    if (!json?.access_token || !json?.refresh_token || !json?.user?.id) return null;
    const expiresAt = Number.isFinite(json.expires_at)
      ? Number(json.expires_at) * 1000
      : now() + (Number(json.expires_in) || 3600) * 1000;
    const tokens = { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt };
    return validAuthTokens(tokens) ? { ...tokens, user: mapGoTrueUser(json.user) } : null;
  }

  async function signUp(input: SignUpInput, options: { redirectTo?: string; codeChallenge?: string } = {}) {
    const path = `/auth/v1/signup${options.redirectTo ? `?redirect_to=${encodeURIComponent(options.redirectTo)}` : ''}`;
    const result = await request(path, {
      method: 'POST',
      body: {
        email: normalizeEmail(input.email), password: input.password,
        data: { display_name: sanitizeDisplayName(input.displayName) },
        ...(options.codeChallenge ? { code_challenge: options.codeChallenge, code_challenge_method: 's256' } : {}),
      },
    });
    if (!result.ok) return result;
    const session = sessionFrom(result.json);
    if (session) return { ok: true as const, session, needsConfirmation: false };
    // Email confirmation required: GoTrue returns the (unconfirmed) user without a session.
    return { ok: true as const, session: null, needsConfirmation: true };
  }

  async function resendConfirmation(email: string, redirectTo?: string) {
    return request(`/auth/v1/resend${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, {
      method: 'POST', body: { type: 'signup', email: normalizeEmail(email) },
    });
  }

  async function signIn(input: Credentials) {
    const result = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: normalizeEmail(input.email), password: input.password },
    });
    if (!result.ok) return result;
    const session = sessionFrom(result.json);
    return session ? { ok: true as const, session } : ({ ok: false, error: 'Unexpected sign-in response.', status: 500 } as GoTrueFailure);
  }

  /** `fatal` = the refresh token was rejected (the session is over), not a network blip. */
  async function refresh(refreshToken: string) {
    const result = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });
    if (!result.ok) return { ...result, fatal: result.status >= 400 && result.status < 500 };
    const session = sessionFrom(result.json);
    return session
      ? { ok: true as const, session }
      : { ok: false as const, error: 'Unexpected refresh response.', status: 500, fatal: false };
  }

  async function sessionRequest(path: string, body: Record<string, unknown>) {
    const result = await request(path, { method: 'POST', body });
    if (!result.ok) return result;
    const session = sessionFrom(result.json);
    return session ? { ok: true as const, session } : { ok: false as const, error: 'The sign-in link did not return a session.', status: 400, code: 'invalid_session' };
  }

  /** OAuth and PKCE email callbacks. The verifier must be from the initiating browser. */
  async function exchangeCodeForSession(code: string, verifier: string) {
    return sessionRequest('/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
  }

  /** Supabase email templates can link directly to /auth/confirm?token_hash=…&type=email. */
  async function verifyOtp(tokenHash: string, type: string) {
    return sessionRequest('/auth/v1/verify', { token_hash: tokenHash, type });
  }

  /** Validate an implicit-flow / handoff access token against GoTrue, never a decoded JWT. */
  async function sessionFromTokens(tokens: AuthTokens) {
    if (!validAuthTokens(tokens)) return { ok: false as const, error: 'Missing session token.', status: 400, code: 'invalid_session' };
    if (tokens.expiresAt <= now()) return refresh(tokens.refreshToken);
    const result = await request('/auth/v1/user', { token: tokens.accessToken });
    if (!result.ok) return result;
    if (!result.json?.id) return { ok: false as const, error: 'Invalid session user.', status: 400, code: 'invalid_session' };
    return { ok: true as const, session: { ...tokens, user: mapGoTrueUser(result.json) } };
  }

  async function updateUser(accessToken: string, data: Record<string, unknown>) {
    const result = await request('/auth/v1/user', { method: 'PUT', token: accessToken, body: { data } });
    if (!result.ok) return result;
    return { ok: true as const, user: mapGoTrueUser(result.json) };
  }

  async function signOut(accessToken: string): Promise<void> {
    await request('/auth/v1/logout', { method: 'POST', token: accessToken });
  }

  /** Uploads (upserts) the avatar to `avatars/{userId}/avatar.{ext}` and returns its public URL. */
  async function uploadAvatar(accessToken: string, userId: string, blob: Blob) {
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${encodeURIComponent(userId)}/avatar.${ext}`;
    const result = await request(`/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
      method: 'POST',
      token: accessToken,
      headers: { 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'true', 'Cache-Control': '3600' },
      raw: blob,
    });
    if (!result.ok) return result;
    return { ok: true as const, url: `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${path}?v=${now()}` };
  }

  return { signUp, signIn, resendConfirmation, refresh, exchangeCodeForSession, verifyOtp, sessionFromTokens, updateUser, signOut, uploadAvatar };
}

export type SupabaseAuth = ReturnType<typeof createSupabaseAuth>;
