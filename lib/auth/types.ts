/**
 * Fan accounts (separate from the /mounadel admin session in lib/adminAuth).
 */

/** `supabase` when a Supabase project is configured, otherwise device-local accounts. */
export type AuthProvider = 'supabase' | 'local';

export interface FavoriteClub {
  id?: string | null;
  name: string;
  badge?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** http(s) URL, a small data: URL (device / local accounts) or `preset:<id>`. */
  avatarUrl: string | null;
  favoriteClub: FavoriteClub | null;
  /** ISO `YYYY-MM-DD` birthdate the fan set on /profile (drives the age chip). */
  birthdate?: string | null;
  /** Country selector code (see lib/geo/countries) shown as a waving flag. */
  countryCode?: string | null;
  /** Registered fan with a confirmed account → shows the verified badge. */
  verified: boolean;
  provider: AuthProvider;
  createdAt: string;
}

/** loading = not read yet (server render / hydration), guest = not signed in. */
export type AuthStatus = 'loading' | 'guest' | 'authenticated';

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  provider: AuthProvider;
}

export interface ProfilePatch {
  displayName?: string;
  avatarUrl?: string | null;
  favoriteClub?: FavoriteClub | null;
  birthdate?: string | null;
  countryCode?: string | null;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  displayName: string;
}

export type AuthResult =
  | { ok: true; user: AuthUser | null; needsConfirmation?: boolean; notice?: string }
  | { ok: false; error: string };
