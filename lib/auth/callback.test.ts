import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/auth/callback/route';
import { GET as confirm } from '@/app/auth/confirm/route';
import { POST } from '@/app/auth/session/route';
import { createSupabaseAuth } from './supabaseAuth';
import { createPkcePair } from './pkce';
import { AUTH_HANDOFF_COOKIE, AUTH_VERIFIER_COOKIE, isAuthHash, tokensFromHash } from './return';
import { AUTH_SESSION_KEY, configureAuth, getAccessToken, getAuthSnapshot, resetAuthForTests, signInWithTokens } from './store';

const credentials = { url: 'https://test.supabase.co', anonKey: 'public-anon' };
const user = { id: 'fan-1', email: 'fan@example.com', email_confirmed_at: '2026-10-15', user_metadata: { display_name: 'Fan One' } };
const session = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const verifier = 'v'.repeat(43);
const request = (path: string, cookie?: string) => new NextRequest(`https://footy.example${path}`, { headers: cookie ? { cookie } : {} });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', credentials.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', credentials.anonKey);
});
afterEach(() => { resetAuthForTests(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Supabase callback routes', () => {
  it('exchanges a PKCE code, redirects only to /profile and hands off via an HttpOnly cookie', async () => {
    const fetcher = vi.fn(async () => json(session));
    vi.stubGlobal('fetch', fetcher);
    const response = await GET(request('/auth/callback?code=one-use-code&next=https://evil.example', `${AUTH_VERIFIER_COOKIE}=${verifier}`));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://footy.example/profile?auth=complete');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fetcher).toHaveBeenCalledWith(`${credentials.url}/auth/v1/token?grant_type=pkce`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ auth_code: 'one-use-code', code_verifier: verifier }),
    }));
    const handoff = response.cookies.get(AUTH_HANDOFF_COOKIE)!;
    expect(handoff).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 120, path: '/auth' });
    expect(response.cookies.get(AUTH_VERIFIER_COOKIE)?.maxAge).toBe(0);
    expect(response.headers.get('location')).not.toMatch(/access|refresh|one-use-code/);

    const handed = await POST(new NextRequest('https://footy.example/auth/session', {
      method: 'POST', headers: { origin: 'https://footy.example', cookie: `${AUTH_HANDOFF_COOKIE}=${handoff.value}` },
    }));
    expect(await handed.json()).toMatchObject({ tokens: { accessToken: 'access', refreshToken: 'refresh' } });
    expect(handed.cookies.get(AUTH_HANDOFF_COOKIE)?.maxAge).toBe(0);
  });

  it('verifies a token_hash on the /auth/confirm alias (works without a PKCE browser cookie)', async () => {
    const fetcher = vi.fn(async () => json(session));
    vi.stubGlobal('fetch', fetcher);
    const response = await confirm(request('/auth/confirm?token_hash=email-hash&type=email'));
    expect(response.headers.get('location')).toContain('/profile?auth=complete');
    expect(fetcher).toHaveBeenCalledWith(`${credentials.url}/auth/v1/verify`, expect.objectContaining({ body: JSON.stringify({ token_hash: 'email-hash', type: 'email' }) }));
  });

  it('falls back to the login panel for missing credentials, with no 404 and no network call', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await GET(request('/auth/callback'));
    expect(response.status).toBe(303);
    // No explicit fragment in Location: browsers preserve legacy #access_token.
    expect(response.headers.get('location')).toBe('https://footy.example/profile?auth=error&reason=missing');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('explains same-browser PKCE requirements instead of attempting an invalid exchange', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await GET(request('/auth/callback?code=c'));
    expect(response.headers.get('location')).toContain('reason=verifier');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('handles expired/already-used confirmation links without leaking raw provider messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error_code: 'otp_expired', msg: 'secret upstream detail' }, 403)));
    const response = await GET(request('/auth/callback?token_hash=old&type=signup'));
    expect(response.headers.get('location')).toContain('reason=expired');
    expect(response.headers.get('location')).not.toContain('secret');
    expect((await GET(request('/auth/callback?error=access_denied&error_code=otp_expired&error_description=untrusted'))).headers.get('location')).toContain('reason=expired');
  });

  it('handles service outages and unconfigured deployments gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect((await GET(request('/auth/callback?token_hash=h&type=email'))).headers.get('location')).toContain('reason=unavailable');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect((await GET(request('/auth/callback?token_hash=h&type=email'))).headers.get('location')).toContain('reason=unavailable');
  });

  it('rejects unsupported confirmation types and malformed successful exchanges', async () => {
    const fetcher = vi.fn(async () => json({ user })); vi.stubGlobal('fetch', fetcher);
    expect((await GET(request('/auth/confirm?token_hash=h&type=recovery'))).headers.get('location')).toContain('reason=invalid');
    expect(fetcher).not.toHaveBeenCalled();
    expect((await GET(request('/auth/confirm?token_hash=h&type=email'))).headers.get('location')).toContain('reason=invalid');
  });

  it('requires a same-origin POST to read the handoff, and clears corrupt/missing handoffs', async () => {
    const crossOrigin = await POST(new NextRequest('https://footy.example/auth/session', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(crossOrigin.status).toBe(403);
    for (const cookie of ['', `${AUTH_HANDOFF_COOKIE}=not-json`]) {
      const response = await POST(new NextRequest('https://footy.example/auth/session', { method: 'POST', headers: { origin: 'https://footy.example', cookie } }));
      expect(response.status).toBe(401);
      expect(response.cookies.get(AUTH_HANDOFF_COOKIE)?.maxAge).toBe(0);
    }
  });
});

describe('browser callback session compatibility', () => {
  it('generates an RFC 7636 S256 challenge', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).toBe(createHash('sha256').update(pair.verifier).digest('base64url'));
    expect((await createPkcePair()).verifier).not.toBe(pair.verifier);
  });

  it('sends a callback redirect and challenge when signing up with PKCE', async () => {
    const fetcher = vi.fn(async () => json({ user }));
    const client = createSupabaseAuth({ ...credentials, fetch: fetcher as unknown as typeof fetch });
    await client.signUp({ email: 'fan@example.com', password: 'goal2026', displayName: 'Fan' }, { redirectTo: 'https://footy.example/auth/callback', codeChallenge: 'challenge' });
    expect(fetcher.mock.calls[0]).toEqual([expect.stringContaining('signup?redirect_to=https%3A%2F%2Ffooty.example%2Fauth%2Fcallback'), expect.objectContaining({ body: expect.stringContaining('"code_challenge_method":"s256"') })]);
  });

  it('parses implicit tokens and validates them with GoTrue before persisting the existing auth store', async () => {
    const tokens = tokensFromHash('#access_token=access&refresh_token=refresh&expires_in=3600')!;
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    const data = new Map<string, string>();
    const fetcher = vi.fn(async () => json(user));
    configureAuth({ credentials, storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } }, fetch: fetcher as unknown as typeof fetch });
    expect(await signInWithTokens(tokens)).toMatchObject({ ok: true, user: { id: 'fan-1', verified: true } });
    expect(fetcher).toHaveBeenCalledWith(`${credentials.url}/auth/v1/user`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access' }) }));
    expect(getAuthSnapshot().status).toBe('authenticated');
    expect(getAccessToken()).toBe('access');
    expect(JSON.parse(data.get(AUTH_SESSION_KEY)!)).toMatchObject({ provider: 'supabase', refreshToken: 'refresh' });
  });

  it('refreshes expired implicit sessions and rejects forged/rejected access tokens', async () => {
    const fetcher = vi.fn(async () => json(session));
    const client = createSupabaseAuth({ ...credentials, fetch: fetcher as unknown as typeof fetch });
    expect(await client.sessionFromTokens({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 })).toMatchObject({ ok: true, session: { accessToken: 'access' } });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('grant_type=refresh_token'), expect.objectContaining({ body: JSON.stringify({ refresh_token: 'refresh' }) }));
    const rejecting = createSupabaseAuth({ ...credentials, fetch: (async () => json({ msg: 'Invalid JWT' }, 401)) as typeof fetch });
    expect(await rejecting.sessionFromTokens({ accessToken: 'forged', refreshToken: 'r', expiresAt: Date.now() + 1000 })).toMatchObject({ ok: false });
    expect(tokensFromHash('#access_token=only')).toBeNull();
    expect(isAuthHash('#access_token=a')).toBe(true);
    expect(isAuthHash('#trophies')).toBe(false);
  });
});
