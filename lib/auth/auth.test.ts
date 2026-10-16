import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataUrlToBlob, isImageAvatar, presetFor } from './avatar';
import { LOCAL_ACCOUNTS_KEY, createLocalAuth, sanitizeAvatarUrl, sanitizeFavoriteClub } from './localAuth';
import { hashPassword, timingSafeEqualBytes, verifyPassword } from './password';
import {
  AUTH_SESSION_KEY,
  DEVICE_AVATAR_PREFIX,
  configureAuth,
  getAccessToken,
  getAuthSnapshot,
  getServerAuthSnapshot,
  resetAuthForTests,
  signIn,
  signOut,
  signUp,
  subscribeAuth,
  updateProfile,
} from './store';
import { createSupabaseAuth, goTrueErrorMessage, mapGoTrueUser } from './supabaseAuth';
import { sanitizeDisplayName, validateDisplayName, validateEmail, validatePassword } from './validation';

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
  };
}

const ITERATIONS = 1000;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

afterEach(() => {
  resetAuthForTests();
  vi.restoreAllMocks();
});

describe('validation', () => {
  it('validates emails, passwords and display names', () => {
    expect(validateEmail('fan@eviv.live')).toBeNull();
    expect(validateEmail(' FAN@EVIV.LIVE ')).toBeNull();
    expect(validateEmail('nope')).toMatch(/valid email/);
    expect(validateEmail('')).toMatch(/enter your email/i);
    expect(validatePassword('goal2026')).toBeNull();
    expect(validatePassword('short1')).toMatch(/at least 8/);
    expect(validatePassword('lettersonly')).toMatch(/number/);
    expect(validatePassword('a1'.repeat(40))).toMatch(/at most 72/);
    expect(validateDisplayName('A')).toMatch(/at least 2/);
    expect(sanitizeDisplayName('  <b>Ultra</b>\u0000   Fan  ')).toBe('bUltra/b Fan');
    expect(sanitizeDisplayName('x'.repeat(40))).toHaveLength(24);
  });
});

describe('password hashing', () => {
  it('hashes with a random salt and verifies in constant time', async () => {
    const a = await hashPassword('goal2026', { iterations: ITERATIONS });
    const b = await hashPassword('goal2026', { iterations: ITERATIONS });
    expect(a.algorithm).toBe('PBKDF2-SHA256');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword('goal2026', a)).toBe(true);
    expect(await verifyPassword('goal2027', a)).toBe(false);
    expect(await verifyPassword('goal2026', null)).toBe(false);
    expect(JSON.stringify(a)).not.toContain('goal2026');
  });

  it('compares byte arrays without short-circuiting', () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
  });
});

describe('local accounts', () => {
  it('signs up, rejects duplicates, signs in and edits the profile', async () => {
    const store = memoryStore();
    const auth = createLocalAuth(store, { iterations: ITERATIONS, randomId: () => 'local-1', now: () => Date.UTC(2026, 9, 15) });

    const created = await auth.signUp({ email: 'Fan@Eviv.live', password: 'goal2026', displayName: 'Ultra Fan' });
    expect(created).toMatchObject({ ok: true, user: { id: 'local-1', email: 'fan@eviv.live', displayName: 'Ultra Fan', verified: true, provider: 'local' } });
    expect(store.map.get(LOCAL_ACCOUNTS_KEY)).not.toContain('goal2026');

    expect(await auth.signUp({ email: 'fan@eviv.live', password: 'goal2026', displayName: 'Copy' })).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/) });
    expect(await auth.signIn({ email: 'fan@eviv.live', password: 'wrong123' })).toEqual({ ok: false, error: 'Wrong email or password.' });
    expect(await auth.signIn({ email: 'nobody@eviv.live', password: 'goal2026' })).toEqual({ ok: false, error: 'Wrong email or password.' });
    expect(await auth.signIn({ email: 'FAN@eviv.live', password: 'goal2026' })).toMatchObject({ ok: true });

    const updated = auth.updateProfile('local-1', {
      displayName: 'Curva Sud',
      avatarUrl: TINY_PNG,
      favoriteClub: { id: '103', name: 'AC Milan', badge: 'https://a.espncdn.com/i/teamlogos/soccer/500/103.png' },
    });
    expect(updated).toMatchObject({ ok: true, user: { displayName: 'Curva Sud', avatarUrl: TINY_PNG, favoriteClub: { id: '103', name: 'AC Milan' } } });
    expect(auth.updateProfile('local-1', { avatarUrl: 'javascript:alert(1)' })).toMatchObject({ ok: false });
    expect(auth.updateProfile('missing', { displayName: 'X1' })).toMatchObject({ ok: false });
  });

  it('sanitises avatars and favourite clubs', () => {
    expect(sanitizeAvatarUrl('preset:eagle')).toBe('preset:eagle');
    expect(sanitizeAvatarUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
    expect(sanitizeAvatarUrl(TINY_PNG)).toBe(TINY_PNG);
    expect(sanitizeAvatarUrl(TINY_PNG, 10)).toBeUndefined();
    expect(sanitizeAvatarUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
    expect(sanitizeAvatarUrl(null)).toBeNull();
    expect(sanitizeFavoriteClub({ name: '', id: '1' })).toBeNull();
    expect(sanitizeFavoriteClub({ name: 'Raja CA', badge: 'javascript:x' })).toEqual({ id: null, name: 'Raja CA', badge: null });
  });
});

describe('avatar helpers', () => {
  it('recognises presets and image avatars and decodes data URLs', async () => {
    expect(presetFor('preset:eagle')?.emoji).toBe('🍋');
    expect(presetFor('preset:unknown')).toBeNull();
    expect(isImageAvatar(TINY_PNG)).toBe(true);
    expect(isImageAvatar('preset:eagle')).toBe(false);
    const blob = dataUrlToBlob(TINY_PNG);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(20);
  });
});

/* -------------------------------------------------------------------------- */
/*  Supabase Auth (GoTrue) client                                             */
/* -------------------------------------------------------------------------- */

const SUPABASE = { url: 'https://proj.supabase.co', anonKey: 'anon-key' };

function goTrueUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uuid-1',
    email: 'fan@eviv.live',
    email_confirmed_at: '2026-10-15T10:00:00Z',
    created_at: '2026-10-15T09:00:00Z',
    user_metadata: { display_name: 'Ultra Fan' },
    ...overrides,
  };
}

function sessionJson(token = 'access-1', refresh = 'refresh-1', user = goTrueUser()) {
  return { access_token: token, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('GoTrue client', () => {
  it('maps users and error payloads', () => {
    expect(mapGoTrueUser(goTrueUser({ user_metadata: { display_name: 'Ultra Fan', avatar_url: 'https://x/a.png', favorite_club: { name: 'Inter' } } }))).toMatchObject({
      id: 'uuid-1', displayName: 'Ultra Fan', verified: true, avatarUrl: 'https://x/a.png', favoriteClub: { name: 'Inter' }, provider: 'supabase',
    });
    expect(mapGoTrueUser(goTrueUser({ email_confirmed_at: null, user_metadata: {} }))).toMatchObject({ displayName: 'fan', verified: false });
    expect(goTrueErrorMessage({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400).message).toBe('Wrong email or password.');
    expect(goTrueErrorMessage({ msg: 'User already registered' }, 422).message).toMatch(/already exists/);
    expect(goTrueErrorMessage(null, 0).message).toMatch(/connection/);
  });

  it('signs up with display-name metadata and reports pending confirmation', async () => {
    const fetchMock = vi.fn(async () => json(goTrueUser({ email_confirmed_at: null })));
    const auth = createSupabaseAuth({ ...SUPABASE, fetch: fetchMock as unknown as typeof fetch });
    const result = await auth.signUp({ email: 'Fan@Eviv.live', password: 'goal2026', displayName: 'Ultra Fan' });
    expect(result).toEqual({ ok: true, session: null, needsConfirmation: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/auth/v1/signup');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'fan@eviv.live', password: 'goal2026', data: { display_name: 'Ultra Fan' } });
    expect((init.headers as Record<string, string>).apikey).toBe('anon-key');
  });

  it('flags rejected refresh tokens as fatal and network errors as retryable', async () => {
    const rejected = createSupabaseAuth({ ...SUPABASE, fetch: (async () => json({ error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400)) as unknown as typeof fetch });
    expect(await rejected.refresh('r')).toMatchObject({ ok: false, fatal: true });
    const offline = createSupabaseAuth({ ...SUPABASE, fetch: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch });
    expect(await offline.refresh('r')).toMatchObject({ ok: false, fatal: false, status: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/*  Store: local provider                                                     */
/* -------------------------------------------------------------------------- */

describe('auth store (device-local accounts)', () => {
  it('starts as guest, persists the session and survives a reload', async () => {
    const storage = memoryStore();
    configureAuth({ storage, credentials: null, iterations: ITERATIONS });
    expect(getServerAuthSnapshot()).toMatchObject({ status: 'loading', provider: 'local' });
    expect(getAuthSnapshot()).toMatchObject({ status: 'guest', user: null, provider: 'local' });

    const listener = vi.fn();
    const unsubscribe = subscribeAuth(listener);
    const result = await signUp({ email: 'fan@eviv.live', password: 'goal2026', displayName: 'Ultra Fan' });
    expect(result).toMatchObject({ ok: true, user: { displayName: 'Ultra Fan', verified: true } });
    expect(listener).toHaveBeenCalled();
    expect(getAuthSnapshot()).toMatchObject({ status: 'authenticated', user: { email: 'fan@eviv.live' } });
    expect(JSON.parse(storage.map.get(AUTH_SESSION_KEY)!)).toMatchObject({ provider: 'local' });
    expect(getAccessToken()).toBeNull();
    unsubscribe();

    // "Reload": a fresh store reading the same storage.
    configureAuth({ storage, credentials: null, iterations: ITERATIONS });
    expect(getAuthSnapshot()).toMatchObject({ status: 'authenticated', user: { displayName: 'Ultra Fan' } });

    expect(await updateProfile({ displayName: 'Curva Sud', avatarUrl: 'preset:eagle' })).toMatchObject({ ok: true, user: { displayName: 'Curva Sud', avatarUrl: 'preset:eagle' } });
    expect(getAuthSnapshot().user?.displayName).toBe('Curva Sud');

    await signOut();
    expect(getAuthSnapshot()).toMatchObject({ status: 'guest', user: null });
    expect(storage.map.has(AUTH_SESSION_KEY)).toBe(false);

    expect(await signIn({ email: 'fan@eviv.live', password: 'nope1234' })).toEqual({ ok: false, error: 'Wrong email or password.' });
    expect(await signIn({ email: 'fan@eviv.live', password: 'goal2026' })).toMatchObject({ ok: true, user: { displayName: 'Curva Sud' } });
  });

  it('validates before touching storage and refuses profile edits for guests', async () => {
    const storage = memoryStore();
    configureAuth({ storage, credentials: null, iterations: ITERATIONS });
    expect(await signUp({ email: 'bad', password: 'goal2026', displayName: 'Ultra Fan' })).toMatchObject({ ok: false });
    expect(storage.map.size).toBe(0);
    expect(await updateProfile({ displayName: 'Nope' })).toEqual({ ok: false, error: 'Sign in to edit your profile.' });
  });
});

/* -------------------------------------------------------------------------- */
/*  Store: Supabase provider                                                  */
/* -------------------------------------------------------------------------- */

describe('auth store (Supabase Auth)', () => {
  function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>, now = () => Date.UTC(2026, 9, 15, 12)) {
    const storage = memoryStore();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
    configureAuth({ storage, credentials: SUPABASE, fetch: fetchMock as unknown as typeof fetch, now });
    return { storage, fetchMock };
  }

  it('signs in, exposes the access token and updates profile metadata', async () => {
    const { storage, fetchMock } = setup((url, init) => {
      if (url.endsWith('/auth/v1/token?grant_type=password')) return json(sessionJson());
      if (url.endsWith('/auth/v1/user') && init.method === 'PUT') {
        const { data } = JSON.parse(String(init.body));
        return json(goTrueUser({ user_metadata: { display_name: data.display_name, favorite_club: data.favorite_club } }));
      }
      return json({}, 404);
    });

    expect(await signIn({ email: 'fan@eviv.live', password: 'wrong' })).toMatchObject({ ok: true });
    expect(getAuthSnapshot()).toMatchObject({ status: 'authenticated', provider: 'supabase', user: { verified: true, displayName: 'Ultra Fan' } });
    expect(getAccessToken()).toBe('access-1');
    expect(JSON.parse(storage.map.get(AUTH_SESSION_KEY)!)).toMatchObject({ provider: 'supabase', refreshToken: 'refresh-1' });

    const result = await updateProfile({ displayName: 'Curva Sud', favoriteClub: { id: '103', name: 'AC Milan' } });
    expect(result).toMatchObject({ ok: true, user: { displayName: 'Curva Sud', favoriteClub: { id: '103', name: 'AC Milan' } } });
    const put = fetchMock.mock.calls.find(([, init]) => init.method === 'PUT')!;
    expect((put[1].headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('uploads avatars to Storage and falls back to a device copy when the upload fails', async () => {
    let uploadStatus = 200;
    const { storage, fetchMock } = setup((url, init) => {
      if (url.includes('grant_type=password')) return json(sessionJson());
      if (url.includes('/storage/v1/object/avatars/uuid-1/avatar.png')) return json({ Key: 'avatars/uuid-1/avatar.png' }, uploadStatus);
      if (url.endsWith('/auth/v1/user') && init.method === 'PUT') {
        const { data } = JSON.parse(String(init.body));
        return json(goTrueUser({ user_metadata: { display_name: 'Ultra Fan', avatar_url: data.avatar_url } }));
      }
      return json({}, 404);
    });
    await signIn({ email: 'fan@eviv.live', password: 'goal2026' });

    const uploaded = await updateProfile({ avatarUrl: TINY_PNG });
    expect(uploaded).toMatchObject({ ok: true });
    expect(getAuthSnapshot().user?.avatarUrl).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/avatars\/uuid-1\/avatar\.png\?v=/);
    // The JWT metadata only ever holds the URL, never the image bytes.
    const put = fetchMock.mock.calls.find(([, init]) => init.method === 'PUT')!;
    expect(String(put[1].body)).not.toContain('base64');

    uploadStatus = 500;
    const fallback = await updateProfile({ avatarUrl: TINY_PNG });
    expect(fallback).toMatchObject({ ok: true, notice: expect.stringMatching(/this device/) });
    expect(getAuthSnapshot().user?.avatarUrl).toBe(TINY_PNG);
    expect(storage.map.get(`${DEVICE_AVATAR_PREFIX}uuid-1`)).toBe(TINY_PNG);
  });

  it('refreshes an expiring token before using it, and signs out when the refresh token is rejected', async () => {
    let clock = Date.UTC(2026, 9, 15, 12);
    let refreshOk = true;
    const { fetchMock } = setup(
      (url) => {
        if (url.includes('grant_type=password')) return json(sessionJson('access-old', 'refresh-old'));
        if (url.includes('grant_type=refresh_token')) {
          return refreshOk ? json(sessionJson('access-new', 'refresh-new')) : json({ error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }, 400);
        }
        if (url.endsWith('/auth/v1/user')) return json(goTrueUser());
        return json({}, 404);
      },
      () => clock
    );
    await signIn({ email: 'fan@eviv.live', password: 'goal2026' });
    clock += 3600_000 - 30_000; // 30 s before expiry
    expect(getAccessToken()).toBe('access-old');

    await updateProfile({ displayName: 'Curva Sud' });
    const refreshCall = fetchMock.mock.calls.find(([url]) => String(url).includes('grant_type=refresh_token'))!;
    expect(JSON.parse(String(refreshCall[1].body))).toEqual({ refresh_token: 'refresh-old' });
    expect(getAccessToken()).toBe('access-new');

    clock += 3600_000; // expired again
    refreshOk = false;
    expect(await updateProfile({ displayName: 'Again' })).toMatchObject({ ok: false, error: expect.stringMatching(/session has ended/) });
    expect(getAuthSnapshot()).toMatchObject({ status: 'guest' });
  });

  it('reports sign-up confirmation and maps sign-in errors', async () => {
    setup((url) => {
      if (url.endsWith('/auth/v1/signup')) return json(goTrueUser({ email_confirmed_at: null }));
      if (url.includes('grant_type=password')) return json({ error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400);
      return json({}, 404);
    });
    expect(await signUp({ email: 'fan@eviv.live', password: 'goal2026', displayName: 'Ultra Fan' })).toMatchObject({ ok: true, user: null, needsConfirmation: true });
    expect(getAuthSnapshot().status).toBe('guest');
    expect(await signIn({ email: 'fan@eviv.live', password: 'goal2026' })).toEqual({ ok: false, error: expect.stringMatching(/confirm your email/) });
  });

  it('signs out remotely and locally', async () => {
    const { storage, fetchMock } = setup((url) => (url.includes('grant_type=password') ? json(sessionJson()) : new Response(null, { status: 204 })));
    await signIn({ email: 'fan@eviv.live', password: 'goal2026' });
    await signOut();
    expect(getAuthSnapshot().status).toBe('guest');
    expect(storage.map.has(AUTH_SESSION_KEY)).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/v1/logout'))).toBe(true);
  });
});
