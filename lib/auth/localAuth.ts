/**
 * Device-local fan accounts, used when no Supabase project is configured.
 *
 * Accounts live in this browser's storage with PBKDF2-hashed passwords, so
 * the whole sign-up / sign-in / profile flow works without a backend. They
 * are scoped to this device (the UI says so).
 */

import { hashPassword, verifyPassword, type PasswordHash } from './password';
import type { AuthUser, Credentials, FavoriteClub, ProfilePatch, SignUpInput } from './types';
import { normalizeEmail, sanitizeDisplayName, validateDisplayName, validateEmail, validatePassword } from './validation';

export const LOCAL_ACCOUNTS_KEY = 'eviv:auth:accounts';
/** Avatars are downscaled client-side; anything bigger is rejected to protect storage. */
export const MAX_LOCAL_AVATAR_CHARS = 120_000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  favoriteClub: FavoriteClub | null;
  createdAt: string;
  password: PasswordHash;
}

export type LocalAuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

export interface LocalAuthOptions {
  iterations?: number;
  now?: () => number;
  randomId?: () => string;
}

function defaultId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `local-${uuid}`;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `local-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function sanitizeFavoriteClub(club: FavoriteClub | null | undefined): FavoriteClub | null {
  if (!club || typeof club !== 'object') return null;
  const name = sanitizeDisplayName(club.name).slice(0, 60) || String(club.name ?? '').trim().slice(0, 60);
  if (!name) return null;
  const badge = typeof club.badge === 'string' && /^https?:\/\//i.test(club.badge) ? club.badge.slice(0, 500) : null;
  const id = club.id === null || club.id === undefined || club.id === '' ? null : String(club.id).slice(0, 40);
  return { id, name, badge };
}

/** Only https/http URLs, small data:image URLs and avatar presets are accepted. */
export function sanitizeAvatarUrl(value: string | null | undefined, maxDataChars = MAX_LOCAL_AVATAR_CHARS): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !value) return undefined;
  if (/^preset:[a-z0-9-]{1,24}$/.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value.slice(0, 1000);
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) && value.length <= maxDataChars) return value;
  return undefined;
}

export function toAuthUser(account: LocalAccount): AuthUser {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    favoriteClub: account.favoriteClub,
    // A registered account on this device is a verified fan.
    verified: true,
    provider: 'local',
    createdAt: account.createdAt,
  };
}

export function createLocalAuth(store: KeyValueStore, options: LocalAuthOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const randomId = options.randomId ?? defaultId;

  function readAccounts(): LocalAccount[] {
    try {
      const value = JSON.parse(store.getItem(LOCAL_ACCOUNTS_KEY) || '[]');
      return Array.isArray(value) ? value.filter((a) => a && typeof a.id === 'string' && typeof a.email === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeAccounts(accounts: LocalAccount[]): string | null {
    try {
      store.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
      return null;
    } catch {
      return 'This browser is out of storage space. Try a smaller picture or free some space.';
    }
  }

  async function signUp(input: SignUpInput): Promise<LocalAuthResult> {
    const error = validateEmail(input.email) || validatePassword(input.password) || validateDisplayName(input.displayName);
    if (error) return { ok: false, error };
    const email = normalizeEmail(input.email);
    const accounts = readAccounts();
    if (accounts.some((a) => a.email === email)) {
      return { ok: false, error: 'An account with this email already exists on this device. Sign in instead.' };
    }
    let password: PasswordHash;
    try {
      password = await hashPassword(input.password, { iterations: options.iterations });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not secure your password.' };
    }
    const account: LocalAccount = {
      id: randomId(),
      email,
      displayName: sanitizeDisplayName(input.displayName),
      avatarUrl: null,
      favoriteClub: null,
      createdAt: new Date(now()).toISOString(),
      password,
    };
    const writeError = writeAccounts([...accounts, account]);
    if (writeError) return { ok: false, error: writeError };
    return { ok: true, user: toAuthUser(account) };
  }

  async function signIn(input: Credentials): Promise<LocalAuthResult> {
    const email = normalizeEmail(input.email);
    const account = readAccounts().find((a) => a.email === email);
    // Same message (and the same hashing work) whether or not the email exists.
    const valid = await verifyPassword(String(input.password ?? ''), account?.password ?? null);
    if (!account || !valid) return { ok: false, error: 'Wrong email or password.' };
    return { ok: true, user: toAuthUser(account) };
  }

  function getUser(userId: string): AuthUser | null {
    const account = readAccounts().find((a) => a.id === userId);
    return account ? toAuthUser(account) : null;
  }

  function updateProfile(userId: string, patch: ProfilePatch): LocalAuthResult {
    const accounts = readAccounts();
    const index = accounts.findIndex((a) => a.id === userId);
    if (index === -1) return { ok: false, error: 'Your session has ended. Please sign in again.' };
    const next: LocalAccount = { ...accounts[index] };

    if (patch.displayName !== undefined) {
      const error = validateDisplayName(patch.displayName);
      if (error) return { ok: false, error };
      next.displayName = sanitizeDisplayName(patch.displayName);
    }
    if (patch.avatarUrl !== undefined) {
      const avatar = sanitizeAvatarUrl(patch.avatarUrl);
      if (avatar === undefined) return { ok: false, error: 'That picture could not be used. Try a smaller JPG, PNG or WebP image.' };
      next.avatarUrl = avatar;
    }
    if (patch.favoriteClub !== undefined) next.favoriteClub = sanitizeFavoriteClub(patch.favoriteClub);

    const updated = [...accounts];
    updated[index] = next;
    const writeError = writeAccounts(updated);
    if (writeError) return { ok: false, error: writeError };
    return { ok: true, user: toAuthUser(next) };
  }

  return { readAccounts, signUp, signIn, getUser, updateProfile };
}

export type LocalAuth = ReturnType<typeof createLocalAuth>;
