/**
 * Admin user registry + moderation (one-click Ban/Unban) for /mounadel.
 *
 * A "user" row is a signed wallet-viewer identity (/lib/coins/session) seen on
 * prediction and wallet traffic plus analytics beacons. Bans are enforced
 * server-side: the predictions and wallet routes reject banned viewers, so a
 * banned fan cannot vote, earn coins or redeem rewards. Coin adjustments go
 * through the authoritative wallet (lib/coins/server) and are settled to the
 * financial ledger.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { loadWallet, saveWallet, type WalletState } from '@/lib/coins/server';
import { recordLedger } from '@/lib/admin/ledger';

const STORE_KEY = 'limon:admin:users:v1';
const STORE_TTL_S = 400 * 24 * 60 * 60;
const MAX_USERS = 500;
const MAX_COIN_DELTA = 1_000_000;

export interface AdminUserRow {
  id: string;
  firstSeen: number;
  lastSeen: number;
  pageviews: number;
  lastPath: string;
  banned: boolean;
  banReason: string;
  bannedAt: number;
}

interface UsersStore {
  users: Record<string, AdminUserRow>;
  /** Most-recently-seen first (capped). */
  order: string[];
  updatedAt: number;
}

const memoryFallback: { store: UsersStore | null } = { store: null };

const validUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{5,63}$/.test(value);

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
      banned: Boolean(r.banned),
      banReason: clean(r.banReason, 120),
      bannedAt: Number.isFinite(r.bannedAt) ? Number(r.bannedAt) : 0,
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

/**
 * Note traffic from a viewer id. Called by routes that already verified the
 * viewer, so only real identities ever enter the table.
 */
export async function registerViewer(userId: unknown, opts: { path?: string; pageview?: boolean; now?: number } = {}): Promise<void> {
  if (!validUserId(userId)) return;
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const store = await loadUsers();
  const row = store.users[userId] ?? {
    id: userId,
    firstSeen: now,
    lastSeen: now,
    pageviews: 0,
    lastPath: '',
    banned: false,
    banReason: '',
    bannedAt: 0,
  };
  row.lastSeen = Math.max(row.lastSeen, now);
  if (!row.firstSeen) row.firstSeen = now;
  if (opts.pageview) row.pageviews += 1;
  const path = clean(opts.path, 120);
  if (path) row.lastPath = path;
  store.users[userId] = row;
  store.order = [userId, ...store.order.filter((id) => id !== userId)].slice(0, MAX_USERS);
  for (const id of Object.keys(store.users)) {
    if (!store.order.includes(id)) delete store.users[id];
  }
  await saveUsers(store);
}

export async function listAdminUsers(now = Date.now()): Promise<AdminUserRow[]> {
  const store = await loadUsers();
  void now;
  return store.order.map((id) => store.users[id]).filter(Boolean);
}

/** Ban status checked by the predictions/wallet routes on every mutation. */
export async function isViewerBanned(userId: unknown): Promise<boolean> {
  if (!validUserId(userId)) return false;
  const store = await loadUsers();
  return Boolean(store.users[userId]?.banned);
}

export type BanResult = { ok: true; user: AdminUserRow } | { ok: false; error: string };

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
  return { ok: true, user: row };
}

export interface CoinAdjustResult {
  ok: boolean;
  wallet?: WalletState;
  error?: string;
}

/**
 * One-click coin adjustment: adds/removes coins on the server-side wallet and
 * writes the movement to the financial ledger. Never trusts client input —
 * the delta is clamped, integer-only, and cannot push a balance negative.
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
  await recordLedger({
    kind: 'admin-adjustment',
    userId,
    coins: amount,
    balanceAfter: saved.balance,
    note: clean(note, 140) || 'Coin adjustment from /mounadel',
    at: now,
  });
  return { ok: true, wallet: saved };
}

/** Wallet balance lookup for the users table (best effort). */
export async function viewerBalance(userId: unknown): Promise<number> {
  if (!validUserId(userId)) return 0;
  try {
    return (await loadWallet(userId)).balance;
  } catch {
    return 0;
  }
}

/** Test helper. */
export function resetAdminUsersMemory(): void {
  memoryFallback.store = null;
}
