/** Shared, non-sensitive callback state. Tokens never belong in a query string. */
export const AUTH_VERIFIER_COOKIE = 'eviv-auth-verifier';
export const AUTH_HANDOFF_COOKIE = 'eviv-auth-handoff';
export const AUTH_HANDOFF_TTL_S = 120;

export type AuthReturnReason = 'missing' | 'expired' | 'verifier' | 'unavailable' | 'invalid';

export const AUTH_RETURN_MESSAGES: Record<AuthReturnReason, string> = {
  missing: 'This sign-in link is missing its session token. Sign in below, or use “Resend confirmation email”.',
  expired: 'This confirmation link has expired or was already used. Sign in below if your email is confirmed, or request a fresh confirmation email.',
  verifier: 'Open this sign-in link in the same browser where you started. You can also sign in below after confirming your email.',
  unavailable: 'The sign-in service is temporarily unavailable. Please check your connection and try signing in below.',
  invalid: 'We could not complete this sign-in link. Please sign in below or request a fresh confirmation email.',
};

export function authReturnReason(value: unknown): AuthReturnReason {
  return typeof value === 'string' && Object.hasOwn(AUTH_RETURN_MESSAGES, value) ? value as AuthReturnReason : 'invalid';
}

export function callbackFailureReason(code?: string, status = 400): AuthReturnReason {
  if (status === 0 || status >= 500) return 'unavailable';
  return /expired|otp|flow_state|invalid_grant|code_verifier/i.test(code || '') ? 'expired' : 'invalid';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms (not the Supabase epoch-seconds representation). */
  expiresAt: number;
}

export function validAuthTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AuthTokens>;
  return typeof v.accessToken === 'string' && v.accessToken.length > 0 && v.accessToken.length <= 12_000 &&
    typeof v.refreshToken === 'string' && v.refreshToken.length > 0 && v.refreshToken.length <= 2_000 &&
    typeof v.expiresAt === 'number' && Number.isFinite(v.expiresAt) && v.expiresAt > 0;
}

/** Implicit-flow confirmations put tokens in a fragment, which HTTP handlers cannot read. */
export function tokensFromHash(hash: string, now = Date.now()): AuthTokens | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token') || '';
  const refreshToken = params.get('refresh_token') || '';
  const expiresAt = params.has('expires_at')
    ? Number(params.get('expires_at')) * 1000
    : now + (Number(params.get('expires_in')) || 3600) * 1000;
  const tokens = { accessToken, refreshToken, expiresAt };
  return validAuthTokens(tokens) ? tokens : null;
}

export function isAuthHash(hash: string): boolean {
  return /(?:^#|&)(?:access_token|refresh_token|error|error_code|error_description)=/.test(hash);
}
