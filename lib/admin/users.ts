/**
 * Admin user registry + moderation for /mounadel — the interactive command centre.
 *
 * A "user" row is a signed wallet-viewer identity (/lib/coins/session) seen on
 * prediction, wallet and analytics traffic. Every mutation the dashboard offers
 * is implemented here, on the server, and each one writes a receipt into the
 * fan's inbox so the account always has an auditable trail:
 *
 *   Ban / Unban        → enforced server-side on votes, coins and redemptions
 *   ± coins            → clamped delta on the authoritative wallet + ledger row
 *   Set balance        → exact override (used for corrections and elite seeding)
 *   VIP tier           → a real entitlement merged into the subscription layer
 *   Direct message     → sent as Platform / Admin / Support with its own styling
 *
 * Nothing here trusts client input: ids, deltas, tiers and copy are all
 * re-validated and clamped before anything is written.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { loadWallet, saveWallet, ownedFlairs, boostCharges, type WalletState } from '@/lib/coins/server';
import { recordLedger } from '@/lib/admin/ledger';
import { findAdminTier, setViewerVipTier, viewerVipRecord, type AdminVipRecord } from '@/lib/admin/vip';
import { deliverMessage, unreadFor, type DeliverInput } from '@/lib/inbox/server';
import { banReceipt, coinGrantReceipt, unbanReceipt, vipGrantReceipt, adminBroadcast } from '@/lib/rewards/receipts';
import type { InboxSenderId } from '@/lib/inbox';

const STORE_KEY = 'limon:admin:users:v1';
const STORE_TTL_S = 400 * 24 * 60 * 60;
const MAX_USERS = 500;
/** One-click ± adjustments stay small… */
export const MAX_COIN_DELTA = 1_000_000;
/** …while an explicit balance override can go as high as the elite test wallet. */
export const MAX_COIN_SET = 9_000_000_000;

export interface AdminUserRow {
  id: string;
  firstSeen: number;
  lastSeen: number;
  pageviews: number;
  lastPath: string;
  /** Nickname the fan voted with, when we have seen one. */
  handle: string;
  banned: boolean;
  banReason: string;
  bannedAt: number;
  /** Mirror of the admin-granted tier so the table can filter without a join. */
  vipTier: string;
  vipExpiresAt: number;
}

interface UsersStore {
  users: Record<string, AdminUserRow>;
  /** Most-recently-seen first (capped). */
  order: string[];
  updatedAt: number;
}

const memoryFallback: { store: UsersStore | null } = { store: null };

const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,63}$/.test(value);

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '').slice(0, max);

function sanitizeStore(raw: unknown): UsersStore {
  const store: UsersStore = { users: {}, order: [], updatedAt: 0 };
  if (!raw || typeof raw !== 'object') return store;
  const value = raw as Partial<UsersStore>;
  for (const [id, row] of Object.entries(value.users || {})) {
    if (!validUserId(id) || !row || typeof row !== 'object') continue;
    const r = row as Partial<AdminUserRow>;
    store.users[id] = {
      id,
      firstSeen: Number.isFinite(r.firstSeen) ? Number(r.firstSeen) : 0,
      lastSeen: Number.isFinite(r.lastSeen) ? Number(r.lastSeen) : 0,
      pageviews: Math.max(0, Math.floor(Number(r.pageviews) || 0)),
      lastPath: clean(r.lastPath, 120),
      handle: clean(r.handle, 24),
      banned: Boolean(r.banned),
      banReason: clean(r.banReason, 120),
      bannedAt: Number.isFinite(r.bannedAt) ? Number(r.bannedAt) : 0,
      vipTier: findAdminTier(r.vipTier)?.id ?? 'free',
      vipExpiresAt: Number.isFinite(r.vipExpiresAt) ? Number(r.vipExpiresAt) : 0,
    };
  }
  store.order = (Array.isArray(value.order) ? value.order : []).filter(validUserId).filter((id) => store.users[id]).slice(0, MAX_USERS);
  if (!store.order.length) store.order = Object.values(store.users).sort((a, b) => b.lastSeen - a.lastSeen).map((u) => u.id).slice(0, MAX_USERS);
  store.updatedAt = Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0;
  return store;
}

async function loadUsers(): Promise<UsersStore> {
  try {
    const stored = await getCacheManager().get<unknown>(STORE_KEY);
    if (stored) {
      const store = sanitizeStore(stored);
      memoryFallback.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Admin users read failed; using the in-process copy', { error: String(err) });
  }
  return memoryFallback.store ?? sanitizeStore(null);
}

async function saveUsers(store: UsersStore): Promise<void> {
  const next = { ...store, updatedAt: Date.now() };
  memoryFallback.store = next;
  try {
    await getCacheManager().set(STORE_KEY, next, STORE_TTL_S);
  } catch (err) {
    logger.warn('Admin users write failed; kept in process', { error: String(err) });
  }
}

async function patchRow(userId: string, patch: Partial<AdminUserRow>, now = Date.now()): Promise<AdminUserRow | null> {
  const store = await loadUsers();
  const row = store.users[userId];
  if (!row) return null;
  const next = { ...row, ...patch };
  store.users[userId] = next;
  await saveUsers(store);
  void now;
  return next;
}

/** Fire-and-forget receipt: a failing inbox write must never undo a mutation. */
async function notify(userId: string, draft: DeliverInput): Promise<void> {
  try {
    await deliverMessage(userId, draft);
  } catch (err) {
    logger.warn('Inbox receipt failed after an admin mutation', { userId, error: String(err) });
  }
}

/**
 * Note traffic from a viewer id. Called by routes that already verified the
 * viewer, so only real identities ever enter the table.
 */
export async function registerViewer(userId: unknown, opts: { path?: string; pageview?: boolean; now?: number; handle?: string } = {}): Promise<void> {
  if (!validUserId(userId)) return;
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const store = await loadUsers();
  const row = store.users[userId] ?? {
    id: userId,
    firstSeen: now,
    lastSeen: now,
    pageviews: 0,
    lastPath: '',
    handle: '',
    banned: false,
    banReason: '',
    bannedAt: 0,
    vipTier: 'free',
    vipExpiresAt: 0,
  };
  row.lastSeen = Math.max(row.lastSeen, now);
  if (!row.firstSeen) row.firstSeen = now;
  if (opts.pageview) row.pageviews += 1;
  const path = clean(opts.path, 120);
  if (path) row.lastPath = path;
  const handle = clean(opts.handle, 24);
  if (handle && handle !== 'Limon fan') row.handle = handle;
  store.users[userId] = row;
  store.order = [userId, ...store.order.filter((id) => id !== userId)].slice(0, MAX_USERS);
  for (const id of Object.keys(store.users)) {
    if (!store.order.includes(id)) delete store.users[id];
  }
  await saveUsers(store);
}

/**
 * Ensures a row exists even for ids that were never seen on traffic (the seeded
 * stealth account, a hand-written import). Idempotent and cheap.
 */
export async function ensureViewer(userId: unknown, opts: { handle?: string; now?: number } = {}): Promise<AdminUserRow | null> {
  if (!validUserId(userId)) return null;
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const store = await loadUsers();
  if (store.users[userId]) {
    const handle = clean(opts.handle, 24);
    if (handle && store.users[userId].handle !== handle) {
      store.users[userId] = { ...store.users[userId], handle };
      await saveUsers(store);
    }
    return store.users[userId];
  }
  const row: AdminUserRow = {
    id: userId,
    firstSeen: now,
    lastSeen: now,
    pageviews: 0,
    lastPath: '/seed',
    handle: clean(opts.handle, 24),
    banned: false,
    banReason: '',
    bannedAt: 0,
    vipTier: 'free',
    vipExpiresAt: 0,
  };
  store.users[userId] = row;
  store.order = [userId, ...store.order.filter((id) => id !== userId)].slice(0, MAX_USERS);
  await saveUsers(store);
  return row;
}

export async function listAdminUsers(now = Date.now()): Promise<AdminUserRow[]> {
  const store = await loadUsers();
  void now;
  return store.order.map((id) => store.users[id]).filter(Boolean);
}

export async function getAdminUser(userId: unknown): Promise<AdminUserRow | null> {
  if (!validUserId(userId)) return null;
  const store = await loadUsers();
  return store.users[userId] ?? null;
}

/** Ban status checked by the predictions/wallet routes on every mutation. */
export async function isViewerBanned(userId: unknown): Promise<boolean> {
  if (!validUserId(userId)) return false;
  const store = await loadUsers();
  return Boolean(store.users[userId]?.banned);
}

export type BanResult = { ok: true; user: AdminUserRow } | { ok: false; error: string };

/** One-click Ban/Unban. The fan is told about it in their inbox, as management. */
export async function setViewerBanned(userId: unknown, banned: boolean, reason = ''): Promise<BanResult> {
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.' };
  const store = await loadUsers();
  const row = store.users[userId];
  if (!row) return { ok: false, error: 'That viewer is not in the registry yet.' };
  row.banned = Boolean(banned);
  row.banReason = banned ? clean(reason, 120) || 'Manual ban from /mounadel' : '';
  row.bannedAt = banned ? Date.now() : 0;
  store.users[userId] = row;
  await saveUsers(store);
  await notify(userId, banned ? banReceipt(row.banReason) : unbanReceipt());
  return { ok: true, user: row };
}

export interface CoinAdjustResult {
  ok: boolean;
  wallet?: WalletState;
  error?: string;
  /** The exact movement applied (after clamping). */
  applied?: number;
}

/**
 * One-click coin adjustment: adds/removes coins on the server-side wallet and
 * writes the movement to the financial ledger. Never trusts client input — the
 * delta is clamped, integer-only, and cannot push a balance negative.
 */
export async function adjustViewerCoins(userId: unknown, delta: unknown, note = '', now = Date.now()): Promise<CoinAdjustResult> {
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.' };
  const amount = Math.trunc(Number(delta));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_COIN_DELTA) {
    return { ok: false, error: `Adjustment must be a non-zero whole number within ±${MAX_COIN_DELTA.toLocaleString('en-US')}.` };
  }
  const wallet = await loadWallet(userId);
  const nextBalance = Math.max(0, wallet.balance + amount);
  if (nextBalance === wallet.balance && amount < 0) return { ok: false, error: 'Balance cannot go below zero.' };
  const saved = await saveWallet(userId, { ...wallet, balance: nextBalance });
  const applied = saved.balance - wallet.balance;
  await recordLedger({
    kind: 'admin-adjustment',
    userId,
    coins: applied,
    balanceAfter: saved.balance,
    note: clean(note, 140) || 'Coin adjustment from /mounadel',
    at: now,
  });
  await notify(userId, coinGrantReceipt(applied, saved, clean(note, 140) || 'An admin adjusted your Limon Coin balance.'));
  return { ok: true, wallet: saved, applied };
}

/** Exact balance override (corrections, elite seeding). Never negative. */
export async function setViewerBalance(userId: unknown, balance: unknown, note = '', now = Date.now()): Promise<CoinAdjustResult> {
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.' };
  const wanted = Math.trunc(Number(balance));
  if (!Number.isFinite(wanted) || wanted < 0 || wanted > MAX_COIN_SET) {
    return { ok: false, error: `Balance must be a whole number between 0 and ${MAX_COIN_SET.toLocaleString('en-US')}.` };
  }
  const wallet = await loadWallet(userId);
  if (wallet.balance === wanted) return { ok: true, wallet, applied: 0 };
  const saved = await saveWallet(userId, { ...wallet, balance: wanted });
  const applied = saved.balance - wallet.balance;
  await recordLedger({
    kind: 'admin-adjustment',
    userId,
    coins: applied,
    balanceAfter: saved.balance,
    note: clean(note, 140) || `Wallet set to ${wanted.toLocaleString('en-US')} by an admin`,
    at: now,
  });
  await notify(userId, coinGrantReceipt(applied, saved, clean(note, 140) || 'An admin set your Limon Coin balance.'));
  return { ok: true, wallet: saved, applied };
}

export interface TierResult {
  ok: boolean;
  error?: string;
  record?: AdminVipRecord | null;
  tier: string;
  expiresAt: number;
}

/** Manual VIP tier assignment — a real entitlement, not a cosmetic chip. */
export async function setViewerTier(userId: unknown, tier: unknown, options: { days?: unknown; note?: unknown } = {}): Promise<TierResult> {
  const definition = findAdminTier(tier);
  if (!definition) return { ok: false, error: 'That tier is not on the menu.', tier: 'free', expiresAt: 0 };
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.', tier: 'free', expiresAt: 0 };

  const result = await setViewerVipTier(userId, tier, { days: options.days, note: options.note });
  if (!result.ok) return { ok: false, error: result.error ?? 'Tier assignment failed.', tier: 'free', expiresAt: 0 };

  const record = result.record ?? null;
  await patchRow(userId, { vipTier: definition.id, vipExpiresAt: record?.expiresAt ?? 0 });
  await recordLedger({
    kind: 'billing-grant',
    userId: String(userId),
    planId: record?.planId ?? 'match',
    note: clean(options.note, 140) || `Admin tier assignment: ${definition.label}`,
  }).catch(() => null);
  if (record) {
    await notify(userId, vipGrantReceipt({ label: definition.label, labelAr: definition.labelAr }, record.expiresAt, clean(options.note, 140)));
  }
  return { ok: true, record, tier: definition.id, expiresAt: record?.expiresAt ?? 0 };
}

/** Direct message from the dashboard, styled by the chosen sender identity. */
export async function messageViewer(userId: unknown, from: InboxSenderId, input: { subject: string; body: string; subjectAr?: string; bodyAr?: string; pinned?: boolean }): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!validUserId(userId)) return { ok: false, error: 'Unknown viewer id.' };
  const draft = adminBroadcast(from, clean(input.subject, 140), clean(input.body, 900), clean(input.subjectAr, 140));
  const delivered = await deliverMessage(userId, { ...draft, pinned: Boolean(input.pinned) });
  if (!delivered) return { ok: false, error: 'That fan is not in the registry yet.' };
  return { ok: true, id: delivered.id };
}

/** Wallet balance + perks lookup for the users table (best effort). */
export async function viewerBalance(userId: unknown): Promise<number> {
  if (!validUserId(userId)) return 0;
  try {
    return (await loadWallet(userId)).balance;
  } catch {
    return 0;
  }
}

export interface ViewerEnrichment {
  balance: number;
  flairs: string[];
  boostCharges: number;
  unread: number;
  vip: AdminVipRecord | null;
}

/** Everything the interactive table row needs, in one call (best effort). */
export async function enrichViewerRow(userId: string): Promise<ViewerEnrichment> {
  const [wallet, vip, unread] = await Promise.all([
    loadWallet(userId).catch(() => null),
    viewerVipRecord(userId).catch(() => null),
    unreadFor(userId).catch(() => 0),
  ]);
  return {
    balance: wallet?.balance ?? 0,
    flairs: wallet ? ownedFlairs(wallet) : [],
    boostCharges: wallet ? boostCharges(wallet) : 0,
    unread,
    vip,
  };
}

/** Test helper. */
export function resetAdminUsersMemory(): void {
  memoryFallback.store = null;
}
