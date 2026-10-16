/**
 * Admin-granted VIP tiers for /mounadel.
 *
 * A one-click tier assignment has to do the same thing a paid pass does —
 * unlock ad-free FHD/4K + Multi-View and light up the tiered badge — so the
 * grant is written in the *entitlement* shape and merged into the subscription
 * layer exactly like a billing grant or a coin redemption. It is stored
 * server-side, keyed by the same signed viewer id, and it expires.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import type { PlanId, SubscriptionGrant } from '@/lib/subscription/plans';
import type { VipTierId } from '@/lib/vip/tiers';

const STORE_KEY = 'limon:admin:vip:v1';
const STORE_TTL_S = 400 * 24 * 60 * 60;
const MAX_ROWS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminTierDefinition {
  /** What the admin dashboard calls the button. */
  id: 'free' | VipTierId;
  label: string;
  labelAr: string;
  /** Plan the entitlement is issued as (drives scope + access rules). */
  planId: PlanId;
  /** Default window in days for a one-click assignment. */
  days: number;
  note: string;
}

export const ADMIN_TIERS: readonly AdminTierDefinition[] = [
  { id: 'free', label: 'No tier', labelAr: 'بدون فئة', planId: 'match', days: 0, note: 'Removes every admin-granted pass.' },
  { id: 'bronze', label: 'Bronze · 24 hours', labelAr: 'برونزي · 24 ساعة', planId: 'weekly', days: 1, note: 'One day of ad-free playback with the Bronze badge.' },
  { id: 'silver', label: 'Silver · 7 days', labelAr: 'فضي · 7 أيام', planId: 'weekly', days: 7, note: 'A week of site-wide VIP with the Silver shield.' },
  { id: 'gold', label: 'Gold · 30 days', labelAr: 'ذهبي · 30 يوماً', planId: 'monthly', days: 30, note: 'A month of VIP with the animated Gold trophy.' },
  { id: 'diamond', label: 'Diamond · 365 days', labelAr: 'ألماسي · 365 يوماً', planId: 'annual', days: 365, note: 'The full year: every surface, the Diamond gem badge.' },
] as const;

export type AdminTierId = AdminTierDefinition['id'];

const TIER_IDS: readonly string[] = ADMIN_TIERS.map((tier) => tier.id);

export function findAdminTier(value: unknown): AdminTierDefinition | undefined {
  return typeof value === 'string' ? ADMIN_TIERS.find((tier) => tier.id === value) : undefined;
}

export interface AdminVipRecord {
  userId: string;
  tier: VipTierId;
  planId: PlanId;
  startsAt: number;
  expiresAt: number;
  note: string;
  grantedAt: number;
}

interface AdminVipStore {
  grants: Record<string, AdminVipRecord>;
  updatedAt: number;
}

const memory: { store: AdminVipStore | null } = { store: null };

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '').slice(0, max);

const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{4,79}$/.test(value);

function sanitizeRecord(raw: unknown): AdminVipRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!validUserId(value.userId)) return null;
  if (typeof value.tier !== 'string' || !TIER_IDS.includes(value.tier) || value.tier === 'free') return null;
  const startsAt = Number.isFinite(Number(value.startsAt)) ? Math.trunc(Number(value.startsAt)) : 0;
  const expiresAt = Number.isFinite(Number(value.expiresAt)) ? Math.trunc(Number(value.expiresAt)) : 0;
  if (expiresAt <= startsAt) return null;
  const plan = value.planId;
  return {
    userId: value.userId,
    tier: value.tier as VipTierId,
    planId: (plan === 'weekly' || plan === 'monthly' || plan === 'annual' || plan === 'match' ? plan : 'monthly') as PlanId,
    startsAt,
    expiresAt,
    note: clean(value.note, 140),
    grantedAt: Number.isFinite(Number(value.grantedAt)) ? Math.trunc(Number(value.grantedAt)) : startsAt,
  };
}

function sanitizeStore(raw: unknown): AdminVipStore {
  const store: AdminVipStore = { grants: {}, updatedAt: 0 };
  const rows = (raw as { grants?: unknown })?.grants;
  if (rows && typeof rows === 'object') {
    for (const [userId, row] of Object.entries(rows as Record<string, unknown>)) {
      const record = sanitizeRecord(row) ?? (sanitizeRecord({ ...(row as object), userId }) as AdminVipRecord | null);
      if (record && Object.keys(store.grants).length < MAX_ROWS) store.grants[userId] = record;
    }
  }
  store.updatedAt = Number.isFinite((raw as { updatedAt?: unknown })?.updatedAt) ? Number((raw as { updatedAt: number }).updatedAt) : 0;
  return store;
}

async function loadStore(): Promise<AdminVipStore> {
  try {
    const stored = await getCacheManager().get<unknown>(STORE_KEY);
    if (stored) {
      const store = sanitizeStore(stored);
      memory.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Admin VIP store read failed; using the in-process copy', { error: String(err) });
  }
  return memory.store ?? { grants: {}, updatedAt: 0 };
}

async function saveStore(store: AdminVipStore, now: number): Promise<void> {
  const next = { ...store, updatedAt: now };
  memory.store = next;
  try {
    await getCacheManager().set(STORE_KEY, next, STORE_TTL_S);
  } catch (err) {
    logger.warn('Admin VIP store write failed; kept in process', { error: String(err) });
  }
}

export interface SetTierResult {
  ok: boolean;
  record?: AdminVipRecord | null;
  error?: string;
  /** The tier that is now live (null when the fan is back on free access). */
  active?: AdminVipRecord | null;
}

/**
 * Assign (or revoke) a VIP tier for one fan. `tier: 'free'` clears the grant.
 * The window can be overridden with `days` (1–3650) so the admin can extend a
 * Gold pass without touching billing.
 */
export async function setViewerVipTier(userId: unknown, tier: unknown, options: { days?: unknown; note?: unknown; now?: number } = {}): Promise<SetTierResult> {
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.' };
  const definition = findAdminTier(tier);
  if (!definition) return { ok: false, error: 'That tier is not on the menu.' };
  const now = Number.isFinite(Number(options.now)) ? Math.trunc(Number(options.now)) : Date.now();

  const store = await loadStore();
  if (definition.id === 'free') {
    if (!store.grants[userId]) return { ok: true, record: null, active: null };
    delete store.grants[userId];
    await saveStore(store, now);
    return { ok: true, record: null, active: null };
  }

  const requestedDays = Number(options.days);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(3650, Math.trunc(requestedDays)) : definition.days;
  const existing = store.grants[userId];
  // Extending the same fan stacks on the live window instead of restarting it.
  const startsAt = existing && existing.expiresAt > now ? existing.expiresAt : now;
  const record: AdminVipRecord = {
    userId,
    tier: definition.id as VipTierId,
    planId: definition.planId,
    startsAt,
    expiresAt: startsAt + days * DAY_MS,
    note: clean(options.note, 140) || `Set from /mounadel (${definition.label})`,
    grantedAt: now,
  };
  store.grants[userId] = record;
  await saveStore(store, now);
  return { ok: true, record, active: record.expiresAt > now ? record : null };
}

/** The admin-granted window for one fan (null when there is none / it lapsed). */
export async function viewerVipRecord(userId: string | null | undefined, now = Date.now()): Promise<AdminVipRecord | null> {
  if (!userId || !validUserId(userId)) return null;
  const store = await loadStore();
  const record = store.grants[userId];
  if (!record || record.expiresAt <= now) return null;
  return record;
}

/** Subscription-shaped grants so the access layer treats them like paid passes. */
export async function loadAdminGrants(userId: string | null | undefined, now = Date.now()): Promise<SubscriptionGrant[]> {
  const record = await viewerVipRecord(userId, now);
  if (!record) return [];
  return [{ id: `admin-vip-${record.userId}`, planId: record.planId, startsAt: record.startsAt, expiresAt: record.expiresAt, tier: record.tier } satisfies SubscriptionGrant];
}

/** Every live admin grant, for the dashboard table + rollups. */
export async function listAdminVipGrants(now = Date.now()): Promise<AdminVipRecord[]> {
  const store = await loadStore();
  return Object.values(store.grants)
    .filter((record) => record.expiresAt > now)
    .sort((a, b) => b.grantedAt - a.grantedAt);
}

/** Test helper. */
export function resetAdminVipMemory(): void {
  memory.store = null;
}
