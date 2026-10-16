/**
 * Role-based access control for the Limon Live staff team.
 *
 * One platform, three desks — each with a hard permission ceiling:
 *
 *   owner      (مالك المنصة)   → everything: money, members, streams, ads, staff.
 *   moderator  (مشرف الدوري)   → league moderation: bans, notices, streams and the
 *                                advertiser desk, but **never** the money ledger.
 *   support    (مدير الدعم)    → fans: read the registry, answer tickets, send
 *                                notices. No bans, no coins, no finance.
 *
 * The same table drives three places, so they can never disagree:
 *   • the sign-in route (which username belongs to which desk),
 *   • the API guard (`hasPermission` on every /api/admin/* handler), and
 *   • the UI (the staff portal renders only the actions the role owns).
 *
 * This module is pure data + pure functions: no crypto, no env secrets, no
 * server imports, so it is safe to bundle into the portal's client components.
 * Credentials are resolved on the server only (see `lib/adminAuth.ts`).
 */

export type StaffRoleId = 'owner' | 'moderator' | 'support';

/**
 * Every privileged action on the platform. A handler asks for exactly one of
 * these, so tightening a desk is a one-line change here.
 */
export type StaffPermission =
  | 'dashboard.view'
  | 'users.view'
  | 'users.ban'
  | 'users.coins'
  | 'users.vip'
  | 'users.message'
  | 'finance.view'
  | 'streams.manage'
  | 'ads.manage'
  | 'staff.manage';

export const STAFF_PERMISSIONS: readonly StaffPermission[] = [
  'dashboard.view',
  'users.view',
  'users.ban',
  'users.coins',
  'users.vip',
  'users.message',
  'finance.view',
  'streams.manage',
  'ads.manage',
  'staff.manage',
] as const;

const ALL_PERMISSIONS: readonly StaffPermission[] = STAFF_PERMISSIONS;

export interface StaffPermissionLabel {
  en: string;
  ar: string;
}

/** Bilingual capability names — the portal lists these on each desk card. */
export const PERMISSION_LABELS: Record<StaffPermission, StaffPermissionLabel> = {
  'dashboard.view': { en: 'Live dashboard', ar: 'لوحة المتابعة الحية' },
  'users.view': { en: 'View the fan registry', ar: 'استعراض سجل الجماهير' },
  'users.ban': { en: 'Ban / unban fans', ar: 'حظر وفك حظر الجماهير' },
  'users.coins': { en: 'Adjust coin balances', ar: 'تعديل أرصدة العملات' },
  'users.vip': { en: 'Grant VIP tiers', ar: 'منح فئات VIP' },
  'users.message': { en: 'Send official notices', ar: 'إرسال إشعارات رسمية' },
  'finance.view': { en: 'Finance & ledger', ar: 'المالية والسجل' },
  'streams.manage': { en: 'Manage streams', ar: 'إدارة البث' },
  'ads.manage': { en: 'Advertiser desk', ar: 'مكتب المعلنين' },
  'staff.manage': { en: 'Manage staff access', ar: 'إدارة صلاحيات الفريق' },
};

export interface StaffRole {
  id: StaffRoleId;
  /** Short English label ("Owner", "League Moderator", "Support Manager"). */
  label: string;
  labelAr: string;
  /** One-line English duty description. */
  duty: string;
  dutyAr: string;
  /** Everything this desk may do. */
  permissions: readonly StaffPermission[];
  /** Accent colour used by the portal chrome (matches the badge palette). */
  accent: string;
  /** Tailwind-ish chip classes for the role badge. */
  chipClass: string;
  /**
   * Sub-domain the desk is expected to sign in on (`staff.eviv.si`). The portal
   * is reachable from any host — this is what the "unified staff portal" link
   * and the host banner point at.
   */
  portalHost: string;
  /** Environment variables that hold this desk's credentials. */
  credentialEnv: { username: string; password: string };
  /** Fallback username for the owner desk (used only when no env is set). */
  defaultUsername?: string;
}

export const DEFAULT_STAFF_HOST = 'staff.eviv.si';
export const LIMON_STAFF_HOST = 'staff.limon.live';

/**
 * Desks, richest first. `owner` is the account that already exists on this
 * deployment (`ADMIN_USERNAME`), so a fresh install keeps working unchanged;
 * the two team desks activate the moment their credentials are provisioned.
 */
export const STAFF_ROLES: readonly StaffRole[] = [
  {
    id: 'owner',
    label: 'Platform Owner',
    labelAr: 'مالك المنصة',
    duty: 'Full command centre: members, money, streams, ads and staff access.',
    dutyAr: 'صلاحية كاملة: الأعضاء، المالية، البث، المعلنون وصلاحيات الفريق.',
    permissions: ALL_PERMISSIONS,
    accent: '#F5C544',
    chipClass: 'border-amber-300/45 bg-amber-300/12 text-amber-200',
    portalHost: DEFAULT_STAFF_HOST,
    credentialEnv: { username: 'ADMIN_USERNAME', password: 'ADMIN_PASSWORD' },
    defaultUsername: 'mounadel',
  },
  {
    id: 'moderator',
    label: 'League Moderator',
    labelAr: 'مشرف الدوري',
    duty: 'Runs the matchday desk: moderation, bans, notices, streams and advertisers.',
    dutyAr: 'مسؤول يوم المباراة: الإشراف، الحظر، الإشعارات، البث والمعلنون.',
    permissions: ['dashboard.view', 'users.view', 'users.ban', 'users.message', 'streams.manage', 'ads.manage'],
    accent: '#CCFF00',
    chipClass: 'border-eviv-lime/45 bg-eviv-lime/12 text-eviv-lime',
    portalHost: DEFAULT_STAFF_HOST,
    credentialEnv: { username: 'MODERATOR_USERNAME', password: 'MODERATOR_PASSWORD' },
  },
  {
    id: 'support',
    label: 'Support Manager',
    labelAr: 'مدير الدعم الفني',
    duty: 'Answers fans, files notices and escalates suspensions — never touches balances.',
    dutyAr: 'يجيب الجماهير، يرسل الإشعارات ويصعّد الحالات — بدون أي صلاحية على الأرصدة.',
    permissions: ['dashboard.view', 'users.view', 'users.message'],
    accent: '#38BDF8',
    chipClass: 'border-sky-400/45 bg-sky-400/12 text-sky-200',
    portalHost: LIMON_STAFF_HOST,
    credentialEnv: { username: 'SUPPORT_USERNAME', password: 'SUPPORT_PASSWORD' },
  },
] as const;

const BY_ID: ReadonlyMap<string, StaffRole> = new Map(STAFF_ROLES.map((role) => [role.id, role]));
const ROLE_IDS: readonly StaffRoleId[] = STAFF_ROLES.map((role) => role.id);

/** The role definition, or undefined for anything that is not a desk. */
export function findStaffRole(id: unknown): StaffRole | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

/** True when `id` names a real desk (used to validate cookie payloads). */
export function isStaffRoleId(id: unknown): id is StaffRoleId {
  return typeof id === 'string' && ROLE_IDS.includes(id as StaffRoleId);
}

/** Every permission a desk owns (empty array for an unknown role). */
export function permissionsFor(role: unknown): readonly StaffPermission[] {
  return findStaffRole(role)?.permissions ?? [];
}

/** The one question every guarded handler asks. */
export function roleCan(role: unknown, permission: StaffPermission): boolean {
  if (!staffPermission(permission)) return false;
  return permissionsFor(role).includes(permission);
}

/** True when `value` is one of the ten privileged actions. */
export function staffPermission(value: unknown): value is StaffPermission {
  return typeof value === 'string' && (STAFF_PERMISSIONS as readonly string[]).includes(value);
}

/** Capability list with bilingual labels, for the portal cards. */
export function capabilityList(role: unknown): Array<{ id: StaffPermission; en: string; ar: string }> {
  return permissionsFor(role).map((id) => ({ id, ...PERMISSION_LABELS[id] }));
}

/** The first desk (richest role) that owns a permission — used for copy/hints. */
export function rolesWithPermission(permission: StaffPermission): readonly StaffRoleId[] {
  return STAFF_ROLES.filter((role) => role.permissions.includes(permission)).map((role) => role.id);
}

/**
 * Staff hosts allowed to front the portal (`staff.eviv.si`, …). `STAFF_PORTAL_HOSTS`
 * is a comma/space separated override; the two brand sub-domains are built in so
 * a `staff.` host is recognised out of the box. `localhost`/preview hosts are
 * never treated as staff hosts, so the fan site keeps working everywhere.
 */
export function staffHosts(env = process.env.STAFF_PORTAL_HOSTS): string[] {
  const configured = typeof env === 'string'
    ? env.split(/[\s,]+/).map((host) => host.trim().toLowerCase()).filter(Boolean)
    : [];
  return [...new Set([DEFAULT_STAFF_HOST, LIMON_STAFF_HOST, ...configured])];
}

/** Strips the port and lowercases a Host header value. */
export function normalizeHost(host: string | null | undefined): string {
  if (typeof host !== 'string') return '';
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * True when the request is on a staff sub-domain. The `staff.` prefix is the
 * general rule (covers `staff.eviv.si`, `staff.limon.live`, any team domain)
 * plus every explicitly configured host.
 */
export function isStaffHost(host: string | null | undefined, env = process.env.STAFF_PORTAL_HOSTS): boolean {
  const clean = normalizeHost(host);
  if (!clean) return false;
  if (clean === 'localhost' || clean.endsWith('.localhost') || clean.endsWith('.e2b.app')) return false;
  if (clean.startsWith('staff.')) return true;
  return staffHosts(env).includes(clean);
}

/** The desk that signs in on a given host (owner by default). */
export function roleForStaffHost(host: string | null | undefined): StaffRoleId {
  const clean = normalizeHost(host);
  const match = STAFF_ROLES.find((role) => role.portalHost === clean);
  return match?.id ?? 'owner';
}

/** Absolute staff portal URL for a role (used by the header + docs). */
export function staffPortalUrl(role: unknown, protocol = 'https'): string {
  const desk = findStaffRole(role) ?? STAFF_ROLES[0];
  return `${protocol}://${desk.portalHost}`;
}

/** Desks sorted for display (owner first) — already the declared order. */
export const STAFF_ROLE_ORDER: readonly StaffRoleId[] = ROLE_IDS;
