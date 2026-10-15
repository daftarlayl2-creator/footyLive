/**
 * Fan auth state for the browser: Guest vs registered user.
 *
 *  - With Supabase configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY) accounts
 *    are Supabase Auth users; the session (access + refresh token) persists
 *    in localStorage and is refreshed a minute before it expires.
 *  - Without it, accounts are device-local (lib/auth/localAuth).
 *
 * The store is a tiny external store (`subscribeAuth` / `getAuthSnapshot`) for
 * React's useSyncExternalStore, so no provider is needed. Sessions sync across
 * tabs through the `storage` event, and the shared Supabase data client reads
 * the access token from here for row-level security.
 */

import { getSupabaseCredentials, setSupabaseAccessTokenProvider } from '../supabase/client';
import { dataUrlToBlob } from './avatar';
import {
  LOCAL_ACCOUNTS_KEY,
  createLocalAuth,
  sanitizeAvatarUrl,
  sanitizeFavoriteClub,
  type KeyValueStore,
  type LocalAuth,
} from './localAuth';
import { createSupabaseAuth, type SupabaseAuth, type SupabaseSession } from './supabaseAuth';
import type { AuthProvider, AuthResult, AuthSnapshot, AuthUser, Credentials, ProfilePatch, SignUpInput } from './types';
import { sanitizeDisplayName, validateDisplayName, validateEmail, validatePassword } from './validation';

export const AUTH_SESSION_KEY = 'eviv:auth:session';
/** Device copy of a Supabase user's avatar when the cloud upload was unavailable. */
export const DEVICE_AVATAR_PREFIX = 'eviv:auth:avatar:';

/** Refresh the Supabase access token this long before it expires. */
const REFRESH_LEAD_MS = 60_000;
const REFRESH_RETRY_MS = 30_000;

type StoredSession =
  | { provider: 'local'; userId: string; signedInAt: number }
  | ({ provider: 'supabase' } & SupabaseSession);

interface AuthEnvironment {
  provider: AuthProvider;
  storage: KeyValueStore | null;
  local: LocalAuth | null;
  remote: SupabaseAuth | null;
  now: () => number;
}

export interface AuthConfig {
  storage?: KeyValueStore | null;
  credentials?: { url: string; anonKey: string } | null;
  fetch?: typeof fetch;
  /** PBKDF2 iterations for local accounts (tests use fewer). */
  iterations?: number;
  now?: () => number;
}

const SERVER_SNAPSHOTS: Record<AuthProvider, AuthSnapshot> = {
  local: Object.freeze({ status: 'loading', user: null, provider: 'local' }) as AuthSnapshot,
  supabase: Object.freeze({ status: 'loading', user: null, provider: 'supabase' }) as AuthSnapshot,
};

let env: AuthEnvironment | null = null;
let session: StoredSession | null = null;
let snapshot: AuthSnapshot | null = null;
let started = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function browserStorage(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildEnvironment(config: AuthConfig = {}): AuthEnvironment {
  const credentials = config.credentials === undefined ? getSupabaseCredentials() : config.credentials;
  const storage = config.storage === undefined ? browserStorage() : config.storage;
  const now = config.now ?? (() => Date.now());
  return {
    provider: credentials ? 'supabase' : 'local',
    storage,
    local: storage ? createLocalAuth(storage, { iterations: config.iterations, now }) : null,
    remote: credentials ? createSupabaseAuth({ ...credentials, fetch: config.fetch, now }) : null,
    now,
  };
}

function environment(): AuthEnvironment {
  env ??= buildEnvironment();
  return env;
}

/** Which backend accounts use in this deployment. */
export function getAuthProvider(): AuthProvider {
  return env?.provider ?? (getSupabaseCredentials() ? 'supabase' : 'local');
}

/* -------------------------------------------------------------------------- */
/*  Snapshot                                                                  */
/* -------------------------------------------------------------------------- */

function readStoredSession(storage: KeyValueStore | null): StoredSession | null {
  try {
    const value = JSON.parse(storage?.getItem(AUTH_SESSION_KEY) || 'null');
    if (value?.provider === 'local' && typeof value.userId === 'string') return value;
    if (
      value?.provider === 'supabase' &&
      typeof value.accessToken === 'string' &&
      typeof value.refreshToken === 'string' &&
      Number.isFinite(value.expiresAt) &&
      value.user?.id
    ) {
      return value;
    }
  } catch {
    // Corrupt session: treat as signed out.
  }
  return null;
}

function writeStoredSession(next: StoredSession | null): void {
  const { storage } = environment();
  try {
    if (next) storage?.setItem(AUTH_SESSION_KEY, JSON.stringify(next));
    else storage?.removeItem(AUTH_SESSION_KEY);
  } catch {
    // Storage full / unavailable: the session still lives in memory for this tab.
  }
}

function withDeviceAvatar(user: AuthUser): AuthUser {
  try {
    const cached = environment().storage?.getItem(DEVICE_AVATAR_PREFIX + user.id);
    return cached ? { ...user, avatarUrl: cached } : user;
  } catch {
    return user;
  }
}

function load(): AuthSnapshot {
  const e = environment();
  const stored = readStoredSession(e.storage);
  if (stored?.provider === 'local' && e.provider === 'local' && e.local) {
    const user = e.local.getUser(stored.userId);
    if (user) {
      session = stored;
      return { status: 'authenticated', user, provider: 'local' };
    }
  }
  if (stored?.provider === 'supabase' && e.provider === 'supabase') {
    session = stored;
    return { status: 'authenticated', user: withDeviceAvatar(stored.user), provider: 'supabase' };
  }
  session = null;
  return { status: 'guest', user: null, provider: e.provider };
}

function emit(next: AuthSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

/** Current auth state (read synchronously from storage on first use). */
export function getAuthSnapshot(): AuthSnapshot {
  if (!env && typeof window === 'undefined') return getServerAuthSnapshot();
  snapshot ??= load();
  return snapshot;
}

/** Stable "not read yet" snapshot for the server render and hydration. */
export function getServerAuthSnapshot(): AuthSnapshot {
  return SERVER_SNAPSHOTS[getAuthProvider()];
}

function onStorage(event: StorageEvent): void {
  const key = event.key;
  if (key === null || key === AUTH_SESSION_KEY || key === LOCAL_ACCOUNTS_KEY || key.startsWith(DEVICE_AVATAR_PREFIX)) {
    emit(load());
    scheduleRefresh();
  }
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    getAuthSnapshot();
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    scheduleRefresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && started) {
      started = false;
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      clearRefreshTimer();
    }
  };
}

/* -------------------------------------------------------------------------- */
/*  Session transitions                                                       */
/* -------------------------------------------------------------------------- */

function clearRefreshTimer(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

function scheduleRefresh(delayOverride?: number): void {
  clearRefreshTimer();
  if (!started || session?.provider !== 'supabase') return;
  const delay = delayOverride ?? Math.max(0, session.expiresAt - environment().now() - REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshSession();
  }, Math.min(delay, 2_147_000_000));
}

function setLocalSession(user: AuthUser): void {
  session = { provider: 'local', userId: user.id, signedInAt: environment().now() };
  writeStoredSession(session);
  emit({ status: 'authenticated', user, provider: 'local' });
}

function setSupabaseSession(next: SupabaseSession): void {
  session = { provider: 'supabase', ...next };
  writeStoredSession(session);
  emit({ status: 'authenticated', user: withDeviceAvatar(next.user), provider: 'supabase' });
  scheduleRefresh();
}

function clearSession(): void {
  session = null;
  writeStoredSession(null);
  clearRefreshTimer();
  emit({ status: 'guest', user: null, provider: environment().provider });
}

/** Refreshes the Supabase session; concurrent callers share one request. */
function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const e = environment();
    const current = session;
    if (current?.provider !== 'supabase' || !e.remote) return false;
    const result = await e.remote.refresh(current.refreshToken);
    if (session !== current) return false; // signed out or replaced meanwhile
    if (result.ok) {
      setSupabaseSession(result.session);
      return true;
    }
    if (result.fatal) clearSession();
    else scheduleRefresh(REFRESH_RETRY_MS);
    return false;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function freshAccessToken(): Promise<string | null> {
  if (session?.provider !== 'supabase') return null;
  if (session.expiresAt - environment().now() < REFRESH_LEAD_MS) await refreshSession();
  return session?.provider === 'supabase' ? session.accessToken : null;
}

/** Access token for PostgREST / Storage calls (null for guests and local accounts). */
export function getAccessToken(): string | null {
  if (!snapshot && (env || typeof window !== 'undefined')) getAuthSnapshot();
  if (session?.provider !== 'supabase') return null;
  return session.expiresAt - environment().now() > 5_000 ? session.accessToken : null;
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                   */
/* -------------------------------------------------------------------------- */

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const error = validateDisplayName(input.displayName) || validateEmail(input.email) || validatePassword(input.password);
  if (error) return { ok: false, error };
  const e = environment();
  getAuthSnapshot();

  if (e.provider === 'supabase' && e.remote) {
    const result = await e.remote.signUp(input);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.session) {
      setSupabaseSession(result.session);
      return { ok: true, user: getAuthSnapshot().user };
    }
    return {
      ok: true,
      user: null,
      needsConfirmation: true,
      notice: 'Almost there! Confirm your email from the link we just sent, then sign in.',
    };
  }

  if (!e.local) return { ok: false, error: 'Accounts need browser storage, which is unavailable here.' };
  const result = await e.local.signUp(input);
  if (!result.ok) return result;
  setLocalSession(result.user);
  return { ok: true, user: result.user };
}

export async function signIn(input: Credentials): Promise<AuthResult> {
  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };
  if (!input.password) return { ok: false, error: 'Enter your password.' };
  const e = environment();
  getAuthSnapshot();

  if (e.provider === 'supabase' && e.remote) {
    const result = await e.remote.signIn(input);
    if (!result.ok) return { ok: false, error: result.error };
    setSupabaseSession(result.session);
    return { ok: true, user: getAuthSnapshot().user };
  }

  if (!e.local) return { ok: false, error: 'Accounts need browser storage, which is unavailable here.' };
  const result = await e.local.signIn(input);
  if (!result.ok) return result;
  setLocalSession(result.user);
  return { ok: true, user: result.user };
}

export async function signOut(): Promise<void> {
  getAuthSnapshot();
  const current = session;
  clearSession();
  if (current?.provider === 'supabase') {
    try {
      await environment().remote?.signOut(current.accessToken);
    } catch {
      // The local session is gone either way.
    }
  }
}

function writeDeviceAvatar(userId: string, value: string | null): void {
  try {
    const { storage } = environment();
    if (value) storage?.setItem(DEVICE_AVATAR_PREFIX + userId, value);
    else storage?.removeItem(DEVICE_AVATAR_PREFIX + userId);
  } catch {
    // Ignore storage failures; the cloud copy (if any) still applies.
  }
}

export async function updateProfile(patch: ProfilePatch): Promise<AuthResult> {
  const e = environment();
  getAuthSnapshot();
  if (!session) return { ok: false, error: 'Sign in to edit your profile.' };

  if (session.provider === 'local') {
    if (!e.local) return { ok: false, error: 'Accounts need browser storage, which is unavailable here.' };
    const result = e.local.updateProfile(session.userId, patch);
    if (!result.ok) return result;
    emit({ status: 'authenticated', user: result.user, provider: 'local' });
    return { ok: true, user: result.user };
  }

  if (!e.remote) return { ok: false, error: 'The sign-in service is not configured.' };
  const data: Record<string, unknown> = {};
  let notice: string | undefined;
  /** undefined = leave the device copy alone, null = remove it. */
  let deviceAvatar: string | null | undefined;

  if (patch.displayName !== undefined) {
    const error = validateDisplayName(patch.displayName);
    if (error) return { ok: false, error };
    data.display_name = sanitizeDisplayName(patch.displayName);
  }
  if (patch.favoriteClub !== undefined) data.favorite_club = sanitizeFavoriteClub(patch.favoriteClub);
  if (patch.avatarUrl !== undefined) {
    const avatar = sanitizeAvatarUrl(patch.avatarUrl);
    if (avatar === undefined) return { ok: false, error: 'That picture could not be used. Try a smaller JPG, PNG or WebP image.' };
    if (avatar && avatar.startsWith('data:')) {
      // Uploaded pictures go to Storage; only the public URL lands in the user metadata.
      const token = await freshAccessToken();
      const upload = token && session ? await e.remote.uploadAvatar(token, session.user.id, dataUrlToBlob(avatar)) : null;
      if (upload?.ok) {
        data.avatar_url = upload.url;
        deviceAvatar = null;
      } else {
        deviceAvatar = avatar;
        notice = 'Picture saved on this device — cloud upload is unavailable right now.';
      }
    } else {
      data.avatar_url = avatar;
      deviceAvatar = null;
    }
  }

  if (Object.keys(data).length > 0) {
    let token = await freshAccessToken();
    if (!token) {
      clearSession();
      return { ok: false, error: 'Your session has ended. Please sign in again.' };
    }
    let result = await e.remote.updateUser(token, data);
    if (!result.ok && result.status === 401 && (await refreshSession())) {
      token = session?.provider === 'supabase' ? session.accessToken : null;
      if (token) result = await e.remote.updateUser(token, data);
    }
    if (!result.ok) return { ok: false, error: result.error };
    if (session?.provider !== 'supabase') return { ok: false, error: 'Your session has ended. Please sign in again.' };
    session = { ...session, user: result.user };
    writeStoredSession(session);
  }

  if (session?.provider !== 'supabase') return { ok: false, error: 'Your session has ended. Please sign in again.' };
  if (deviceAvatar !== undefined) writeDeviceAvatar(session.user.id, deviceAvatar);
  const user = withDeviceAvatar(session.user);
  emit({ status: 'authenticated', user, provider: 'supabase' });
  return { ok: true, user, notice };
}

/* -------------------------------------------------------------------------- */
/*  Configuration & tests                                                     */
/* -------------------------------------------------------------------------- */

/** Replaces the environment (storage, Supabase credentials, fetch); resets state. */
export function configureAuth(config: AuthConfig = {}): void {
  clearRefreshTimer();
  env = buildEnvironment(config);
  session = null;
  snapshot = null;
  refreshing = null;
}

/** Forgets all state and listeners (unit tests). */
export function resetAuthForTests(): void {
  clearRefreshTimer();
  if (started && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  started = false;
  listeners.clear();
  env = null;
  session = null;
  snapshot = null;
  refreshing = null;
}

// The shared PostgREST client sends the signed-in user's token (RLS: auth.uid()).
setSupabaseAccessTokenProvider(getAccessToken);
