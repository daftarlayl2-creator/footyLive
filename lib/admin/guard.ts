/**
 * Admin API guard: every /api/admin/* route (except the login route itself)
 * checks the signed staff session cookie minted by /api/admin/auth.
 *
 * RBAC lives here too: a handler that needs a specific capability asks
 * `requirePermission(request, 'users.ban')` and gets either the acting desk or a
 * ready-to-return 401/403 response. A signed-in Support Manager therefore cannot
 * reach a coin adjustment even by calling the API directly — the UI merely hides
 * what this file refuses.
 */
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  readStaffSession,
  type StaffSession,
} from '@/lib/adminAuth';
import { PERMISSION_LABELS, roleCan, type StaffPermission } from '@/lib/admin/rbac';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/** The raw session cookie value, when it carries a valid signature. */
export function adminSessionFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === ADMIN_SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return readStaffSession(value) ? value : null;
    }
  }
  return null;
}

/** The verified session behind the cookie, or null. */
export function staffSessionFromCookies(cookieHeader: string | null): StaffSession | null {
  const token = adminSessionFromCookies(cookieHeader);
  return token ? readStaffSession(token) : null;
}

/** The acting desk for a request (null when nobody is signed in). */
export function staffSessionFromRequest(request: Request): StaffSession | null {
  return staffSessionFromCookies(request.headers.get('cookie'));
}

/** True when the request carries a valid, unexpired staff session. */
export function isAdminRequest(request: Request): boolean {
  return staffSessionFromRequest(request) !== null;
}

/** True when the acting desk owns `permission`. */
export function hasPermission(request: Request, permission: StaffPermission): boolean {
  const session = staffSessionFromRequest(request);
  return session ? roleCan(session.role, permission) : false;
}

export type PermissionCheck =
  | { ok: true; session: StaffSession }
  | { ok: false; response: NextResponse };

/**
 * Gate for a guarded handler. Missing/expired session → 401; a valid session
 * from a desk that does not own the capability → 403 with the bilingual
 * capability name, which is what the portal shows on the locked card.
 */
export function requirePermission(request: Request, permission: StaffPermission): PermissionCheck {
  const session = staffSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin session required.', reason: 'unauthenticated' }, { status: 401, headers }),
    };
  }
  if (!roleCan(session.role, permission)) {
    const label = PERMISSION_LABELS[permission];
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Your desk (${session.role}) does not include “${label.en}”. Ask the platform owner for access.`,
          errorAr: `صلاحيات مكتبك (${session.role}) لا تشمل «${label.ar}». تواصل مع مالك المنصة.`,
          reason: 'forbidden',
          required: permission,
          role: session.role,
        },
        { status: 403, headers }
      ),
    };
  }
  return { ok: true, session };
}

/** Convenience for handlers that already had the 401 body inlined. */
export function unauthorized(message = 'Admin session required.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401, headers });
}
