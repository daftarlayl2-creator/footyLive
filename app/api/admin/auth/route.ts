/**
 * GET / POST / DELETE /api/admin/auth — the unified staff sign-in.
 *
 * One endpoint serves every desk: the username decides the role (owner,
 * moderator, support), the role is baked into the signed cookie and the response
 * advertises the capabilities that desk owns, so `/mounadel` and `/staff` can
 * render exactly the tools the account can actually use.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  STAFF_SESSION_TTL_MS,
  createSessionTokenFor,
  credentialsForRole,
  provisionedRoles,
  readStaffSession,
  resolveStaffRole,
} from '@/lib/adminAuth';
import { STAFF_ROLES, capabilityList, findStaffRole, isStaffHost, roleForStaffHost } from '@/lib/admin/rbac';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

/** The desks this deployment has credentials for (never leaks the secrets). */
function desksPayload() {
  return STAFF_ROLES.filter((desk) => credentialsForRole(desk.id) !== null).map((desk) => ({
    id: desk.id,
    label: desk.label,
    labelAr: desk.labelAr,
    duty: desk.duty,
    dutyAr: desk.dutyAr,
    accent: desk.accent,
    portalHost: desk.portalHost,
    permissions: desk.permissions,
  }));
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = readStaffSession(token);
  const host = request.headers.get('host');
  const role = session ? findStaffRole(session.role) : null;
  return NextResponse.json(
    {
      authenticated: Boolean(session),
      role: session?.role ?? null,
      roleLabel: role?.label ?? null,
      roleLabelAr: role?.labelAr ?? null,
      capabilities: session ? capabilityList(session.role) : [],
      expiresAt: session?.expiresAt ?? null,
      // True when the request itself arrived on a staff sub-domain.
      staffHost: isStaffHost(host),
      hostRole: roleForStaffHost(host),
      // Which desks are provisioned on this deployment (for the portal cards).
      desks: desksPayload(),
      provisioned: provisionedRoles(),
    },
    { headers }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body ?? {};

    const staffRole = resolveStaffRole(username, password);
    if (!staffRole) {
      return NextResponse.json(
        { authenticated: false, error: 'Invalid username or password' },
        { status: 401, headers }
      );
    }

    const desk = findStaffRole(staffRole);
    const token = createSessionTokenFor(staffRole);
    const response = NextResponse.json(
      {
        authenticated: true,
        role: staffRole,
        roleLabel: desk?.label ?? null,
        roleLabelAr: desk?.labelAr ?? null,
        capabilities: capabilityList(staffRole),
      },
      { headers }
    );
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(STAFF_SESSION_TTL_MS / 1000),
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch {
    return NextResponse.json(
      { authenticated: false, error: 'Unable to process login request' },
      { status: 400, headers }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false }, { headers });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
