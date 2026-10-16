import crypto from 'crypto';
import {
  STAFF_ROLES,
  findStaffRole,
  isStaffRoleId,
  permissionsFor,
  type StaffPermission,
  type StaffRoleId,
} from '@/lib/admin/rbac';

export const ADMIN_SESSION_COOKIE = 'eviv_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.STREAM_SECRET ||
    'default_stream_hmac_secret_key_123_abc'
  );
}

function getExpectedCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'mounadel',
    password: process.env.ADMIN_PASSWORD || 'Riihabtii95@',
  };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------------------- */
/*  Credentials → desk                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Credentials provisioned for one desk. The owner desk keeps the historic
 * `ADMIN_USERNAME` / `ADMIN_PASSWORD` pair (with the built-in fallback, so an
 * existing install never locks itself out). The team desks have **no** default
 * password: they activate exactly when the operator sets their env pair.
 */
export function credentialsForRole(role: StaffRoleId): { username: string; password: string } | null {
  const desk = findStaffRole(role);
  if (!desk) return null;
  if (role === 'owner') {
    const { username, password } = getExpectedCredentials();
    return { username, password };
  }
  const username = String(process.env[desk.credentialEnv.username] || '').trim();
  const password = String(process.env[desk.credentialEnv.password] || '');
  if (!username || !password) return null;
  return { username, password };
}

/** Desks with credentials on this deployment (used by the portal + docs). */
export function provisionedRoles(): StaffRoleId[] {
  return STAFF_ROLES.map((desk) => desk.id).filter((id) => credentialsForRole(id) !== null);
}

/**
 * Resolves a login to the desk it belongs to, or null. Every configured desk is
 * compared with `timingSafeEqual`, and the password comparison always runs, so a
 * wrong username cannot be distinguished from a wrong password by timing.
 */
export function resolveStaffRole(username: unknown, password: unknown): StaffRoleId | null {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const candidateUser = username.trim();
  let matched: StaffRoleId | null = null;
  let anyMatch = false;
  for (const desk of STAFF_ROLES) {
    const expected = credentialsForRole(desk.id);
    if (!expected) continue;
    const userOk = safeEqual(candidateUser, expected.username);
    const passOk = safeEqual(password, expected.password);
    anyMatch = anyMatch || userOk;
    if (userOk && passOk) matched = desk.id;
  }
  // `anyMatch` keeps the loop honest for linters and future auditing hooks.
  return matched ?? (anyMatch ? null : null);
}

/**
 * Historic boolean check — still answers "is this the platform owner?" so the
 * old call sites (and their tests) keep their exact meaning.
 */
export function validateAdminCredentials(username: unknown, password: unknown): boolean {
  return resolveStaffRole(username, password) === 'owner';
}

/* -------------------------------------------------------------------------- */
/*  Session tokens                                                            */
/* -------------------------------------------------------------------------- */

export interface StaffSession {
  role: StaffRoleId;
  expiresAt: number;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * Legacy owner token: `<expiresAt>.<hmac>`. Unchanged on purpose — cookies that
 * are already in the wild must keep verifying across a deploy.
 */
export function createAdminSessionToken(now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${sign(`admin:${expiresAt}`)}`;
}

/**
 * Role-bearing token: `staff:<role>:<expiresAt>.<hmac>`. The role is inside the
 * signed payload, so a fan cannot edit a cookie into a moderator session.
 */
export function createStaffSessionToken(role: StaffRoleId, now = Date.now()): string {
  const desk = findStaffRole(role) ?? STAFF_ROLES[0];
  const expiresAt = now + SESSION_TTL_MS;
  return `staff:${desk.id}:${expiresAt}.${sign(`staff:${desk.id}:${expiresAt}`)}`;
}

/** Mints the right token for a desk (owner keeps the legacy format). */
export function createSessionTokenFor(role: StaffRoleId, now = Date.now()): string {
  return role === 'owner' ? createAdminSessionToken(now) : createStaffSessionToken(role, now);
}

function verify(token: string | undefined | null, now: number): StaffSession | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const rawPayload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const staff = /^staff:([a-z]+):(\d+)$/.exec(rawPayload);
  if (staff) {
    const role = staff[1];
    const expiresAt = Number(staff[2]);
    if (!isStaffRoleId(role)) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (!safeEqual(signature, sign(`staff:${role}:${expiresAt}`))) return null;
    return { role, expiresAt };
  }

  const legacy = /^(\d+)$/.exec(rawPayload);
  if (legacy) {
    const expiresAt = Number(legacy[1]);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    if (!safeEqual(signature, sign(`admin:${expiresAt}`))) return null;
    // Every pre-RBAC cookie was minted for the owner desk.
    return { role: 'owner', expiresAt };
  }

  return null;
}

/** True for any valid, unexpired staff session (owner or team desk). */
export function verifyAdminSessionToken(token: string | undefined | null, now = Date.now()): boolean {
  return verify(token, now) !== null;
}

/** The desk + expiry behind a cookie, or null. */
export function readStaffSession(token: string | undefined | null, now = Date.now()): StaffSession | null {
  return verify(token, now);
}

/** Permission list for a session (convenience for the auth route payload). */
export function sessionPermissions(session: StaffSession | null): readonly StaffPermission[] {
  return session ? permissionsFor(session.role) : [];
}

/** Cookie/session lifetime in milliseconds (12 hours). */
export const STAFF_SESSION_TTL_MS = SESSION_TTL_MS;
