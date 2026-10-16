/**
 * Admin API guard: every /api/admin/* route (except the login route itself)
 * checks the signed admin session cookie minted by /api/admin/auth.
 */
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/adminAuth';

export function adminSessionFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === ADMIN_SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return verifyAdminSessionToken(value) ? value : null;
    }
  }
  return null;
}

/** True when the request carries a valid, unexpired admin session. */
export function isAdminRequest(request: Request): boolean {
  return adminSessionFromCookies(request.headers.get('cookie')) !== null;
}
