/**
 * RBAC: roles, capabilities, staff hosts and the signed role session.
 *
 * The security-relevant claims here are: a desk can never do more than its role
 * allows, a role cookie cannot be forged or edited, and the legacy owner cookie
 * keeps verifying across the upgrade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STAFF_ROLES,
  capabilityList,
  isStaffHost,
  normalizeHost,
  PERMISSION_LABELS,
  roleCan,
  roleForStaffHost,
  rolesWithPermission,
  staffHosts,
  staffPermission,
} from './rbac';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  createSessionTokenFor,
  credentialsForRole,
  provisionedRoles,
  readStaffSession,
  resolveStaffRole,
  validateAdminCredentials,
  verifyAdminSessionToken,
} from '@/lib/adminAuth';

const NOW = Date.parse('2026-10-16T16:00:00Z');

beforeEach(() => {
  vi.stubEnv('ADMIN_USERNAME', 'mounadel');
  vi.stubEnv('ADMIN_PASSWORD', 'Riihabtii95@');
  vi.stubEnv('MODERATOR_USERNAME', '');
  vi.stubEnv('MODERATOR_PASSWORD', '');
  vi.stubEnv('SUPPORT_USERNAME', '');
  vi.stubEnv('SUPPORT_PASSWORD', '');
  vi.stubEnv('STAFF_PORTAL_HOSTS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('role capability matrix', () => {
  it('gives the owner every privileged action', () => {
    for (const permission of Object.keys(PERMISSION_LABELS) as Array<keyof typeof PERMISSION_LABELS>) {
      expect(roleCan('owner', permission), permission).toBe(true);
      expect(staffPermission(permission)).toBe(true);
    }
  });

  it('keeps money away from moderators and support', () => {
    expect(roleCan('moderator', 'users.ban')).toBe(true);
    expect(roleCan('moderator', 'streams.manage')).toBe(true);
    expect(roleCan('moderator', 'ads.manage')).toBe(true);
    expect(roleCan('moderator', 'users.coins')).toBe(false);
    expect(roleCan('moderator', 'users.vip')).toBe(false);
    expect(roleCan('moderator', 'finance.view')).toBe(false);
    expect(roleCan('moderator', 'staff.manage')).toBe(false);

    expect(roleCan('support', 'users.view')).toBe(true);
    expect(roleCan('support', 'users.message')).toBe(true);
    expect(roleCan('support', 'users.ban')).toBe(false);
    expect(roleCan('support', 'users.coins')).toBe(false);
    expect(roleCan('support', 'finance.view')).toBe(false);
    expect(roleCan('support', 'ads.manage')).toBe(false);
  });

  it('rejects junk roles and junk permissions', () => {
    expect(roleCan('admin', 'users.view')).toBe(false);
    expect(roleCan(null, 'users.view')).toBe(false);
    expect(roleCan('owner', 'nope' as never)).toBe(false);
    expect(staffPermission('drop table')).toBe(false);
    expect(capabilityList('support').map((row) => row.id)).toEqual(['dashboard.view', 'users.view', 'users.message']);
    expect(capabilityList('ghost')).toEqual([]);
  });

  it('names the desks that own a capability', () => {
    expect(rolesWithPermission('users.coins')).toEqual(['owner']);
    expect(rolesWithPermission('users.ban')).toEqual(['owner', 'moderator']);
    expect(rolesWithPermission('users.message')).toEqual(['owner', 'moderator', 'support']);
  });
});

describe('unified staff hosts', () => {
  it('recognises the brand staff sub-domains and any configured host', () => {
    expect(isStaffHost('staff.eviv.si')).toBe(true);
    expect(isStaffHost('staff.limon.live')).toBe(true);
    expect(isStaffHost('staff.eviv.si:443')).toBe(true);
    expect(isStaffHost('STAFF.Other-Domain.com')).toBe(true);
    expect(isStaffHost('limonlive.app')).toBe(false);
    // The preview/local hosts are never treated as staff hosts.
    expect(isStaffHost('localhost:3000')).toBe(false);
    expect(isStaffHost('3000-abc.e2b.app')).toBe(false);
    expect(isStaffHost(null)).toBe(false);
    expect(normalizeHost('Staff.Eviv.Si:8443')).toBe('staff.eviv.si');
  });

  it('honours the STAFF_PORTAL_HOSTS override and maps hosts to desks', () => {
    expect(staffHosts('team.example.ma, ops.example.ma')).toContain('team.example.ma');
    expect(isStaffHost('ops.example.ma', 'team.example.ma ops.example.ma')).toBe(true);
    expect(roleForStaffHost('staff.limon.live')).toBe('support');
    expect(roleForStaffHost('staff.eviv.si')).toBe('owner');
    expect(roleForStaffHost('limonlive.app')).toBe('owner');
    expect(STAFF_ROLES.map((desk) => desk.portalHost)).toContain('staff.eviv.si');
  });
});

describe('desk credentials', () => {
  it('keeps the owner working out of the box and leaves team desks unprovisioned', () => {
    expect(credentialsForRole('owner')).toEqual({ username: 'mounadel', password: 'Riihabtii95@' });
    expect(credentialsForRole('moderator')).toBeNull();
    expect(credentialsForRole('support')).toBeNull();
    expect(provisionedRoles()).toEqual(['owner']);
  });

  it('activates a team desk only when its env pair is set', () => {
    vi.stubEnv('MODERATOR_USERNAME', 'hicham.mod');
    vi.stubEnv('MODERATOR_PASSWORD', 'mod-secret-2026');
    expect(resolveStaffRole('hicham.mod', 'mod-secret-2026')).toBe('moderator');
    expect(resolveStaffRole('hicham.mod', 'wrong')).toBeNull();
    expect(resolveStaffRole('mounadel', 'mod-secret-2026')).toBeNull();
    expect(provisionedRoles()).toEqual(['owner', 'moderator']);
    expect(validateAdminCredentials('mounadel', 'Riihabtii95@')).toBe(true);
    expect(validateAdminCredentials('hicham.mod', 'mod-secret-2026')).toBe(false);
  });
});

describe('signed staff sessions', () => {
  it('mints an owner token that verifies with the legacy payload', () => {
    const token = createAdminSessionToken(NOW);
    expect(verifyAdminSessionToken(token, NOW)).toBe(true);
    expect(readStaffSession(token, NOW)).toEqual({ role: 'owner', expiresAt: NOW + 12 * 60 * 60 * 1000 });
  });

  it('bakes the role into the signature', () => {
    const moderator = createSessionTokenFor('moderator', NOW);
    expect(moderator.startsWith('staff:moderator:')).toBe(true);
    expect(readStaffSession(moderator, NOW)?.role).toBe('moderator');
    // A moderator token edited into an owner token fails the HMAC check.
    const forged = moderator.replace('staff:moderator:', 'staff:owner:');
    expect(readStaffSession(forged, NOW)).toBeNull();
    expect(verifyAdminSessionToken(forged, NOW)).toBe(false);
  });

  it('expires sessions and rejects junk', () => {
    const token = createSessionTokenFor('support', NOW);
    const later = NOW + 13 * 60 * 60 * 1000;
    expect(verifyAdminSessionToken(token, later)).toBe(false);
    expect(readStaffSession(undefined, NOW)).toBeNull();
    expect(readStaffSession('nonsense', NOW)).toBeNull();
    expect(readStaffSession(`${NOW}.deadbeef`, NOW)).toBeNull();
    expect(ADMIN_SESSION_COOKIE).toBe('eviv_admin_session');
  });
});
