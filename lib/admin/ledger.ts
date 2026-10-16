/**
 * Admin financial ledger for /mounadel.
 *
 * Every money/coin movement the platform performs server-side lands here:
 * coin-redeemed VIP passes, admin coin adjustments and billing pass grants
 * (when the optional billing adapter is configured). Rows are append-only and
 * sanitized so the dashboard's totals can never be shaped by client input.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';

export const LEDGER_KEY = 'limon:admin:ledger:v1';
const LEDGER_TTL_S = 400 * 24 * 60 * 60;
const MAX_ENTRIES = 400;

export type LedgerKind = 'coin-redeem' | 'admin-adjustment' | 'billing-grant' | 'coin-grant';
export const LEDGER_KINDS: readonly LedgerKind[] = ['coin-redeem', 'admin-adjustment', 'billing-grant', 'coin-grant'];

export interface LedgerInput {
  kind: LedgerKind;
  userId: string;
  /** Coins moved (negative when spent/removed). */
  coins?: number;
  /** Wallet balance right after the movement, when known. */
  balanceAfter?: number;
  /** MAD amount for billing entries, minor units (4000 = 40 MAD). */
  amountMinor?: number;
  planId?: string;
  note?: string;
  at?: number;
}

export interface LedgerEntry extends LedgerInput {
  id: string;
  at: number;
}

interface LedgerStore {
  entries: LedgerEntry[];
  updatedAt: number;
}

const memoryFallback: { store: LedgerStore | null } = { store: null };

let sequence = 0;

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '').slice(0, max);

const validKind = (value: unknown): value is LedgerKind => LEDGER_KINDS.includes(value as LedgerKind);

function sanitizeEntry(raw: any): LedgerEntry | null {
  if (!raw || typeof raw !== 'object' || !validKind(raw.kind)) return null;
  const userId = typeof raw.userId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{5,63}$/.test(raw.userId) ? raw.userId : null;
  if (!userId) return null;
  return {
    id: typeof raw.id === 'string' && /^[\w.-]{6,80}$/.test(raw.id) ? raw.id : `ledger-${Date.now().toString(36)}-${(sequence += 1)}`,
    kind: raw.kind,
    userId,
    coins: Number.isFinite(raw.coins) ? Math.trunc(Number(raw.coins)) : 0,
    ...(Number.isFinite(raw.balanceAfter) ? { balanceAfter: Math.max(0, Math.trunc(Number(raw.balanceAfter))) } : {}),
    ...(Number.isFinite(raw.amountMinor) ? { amountMinor: Math.max(0, Math.trunc(Number(raw.amountMinor))) } : {}),
    ...(raw.planId ? { planId: clean(raw.planId, 24) } : {}),
    note: clean(raw.note, 140),
    at: Number.isFinite(raw.at) ? Math.trunc(Number(raw.at)) : 0,
  };
}

function sanitizeStore(raw: unknown): LedgerStore {
  const entries = (Array.isArray((raw as any)?.entries) ? (raw as any).entries : [])
    .flatMap((row: any) => {
      const entry = sanitizeEntry(row);
      return entry ? [entry] : [];
    })
    .slice(-MAX_ENTRIES);
  return { entries, updatedAt: Number.isFinite((raw as any)?.updatedAt) ? Number((raw as any).updatedAt) : 0 };
}

async function loadLedger(): Promise<LedgerStore> {
  try {
    const stored = await getCacheManager().get<unknown>(LEDGER_KEY);
    if (stored) {
      const store = sanitizeStore(stored);
      memoryFallback.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Ledger read failed; using the in-process copy', { error: String(err) });
  }
  return memoryFallback.store ?? sanitizeStore(null);
}

async function saveLedger(store: LedgerStore): Promise<void> {
  const next = { ...store, updatedAt: Date.now() };
  memoryFallback.store = next;
  try {
    await getCacheManager().set(LEDGER_KEY, next, LEDGER_TTL_S);
  } catch (err) {
    logger.warn('Ledger write failed; kept in process', { error: String(err) });
  }
}

/** Append one movement; the row is sanitized here, never by the caller. */
export async function recordLedger(input: LedgerInput, now = Date.now()): Promise<LedgerEntry | null> {
  const entry = sanitizeEntry({ ...input, at: Number.isFinite(input?.at) ? input.at : now, id: `ledger-${now.toString(36)}-${(sequence += 1)}-${Math.floor(Math.random() * 1e6).toString(36)}` });
  if (!entry) return null;
  const store = await loadLedger();
  store.entries.push(entry);
  store.entries = store.entries.slice(-MAX_ENTRIES);
  await saveLedger(store);
  return entry;
}

export interface LedgerSnapshot {
  entries: LedgerEntry[];
  totals: {
    redemptions: number;
    coinsSpent: number;
    coinsIssued: number;
    adminAdjustments: number;
    billingGrants: number;
    revenueMinor: number;
  };
  updatedAt: number;
}

/** Latest-first view + running totals for the finance tab. */
export async function ledgerSnapshot(now = Date.now()): Promise<LedgerSnapshot> {
  void now;
  const store = await loadLedger();
  const totals = { redemptions: 0, coinsSpent: 0, coinsIssued: 0, adminAdjustments: 0, billingGrants: 0, revenueMinor: 0 };
  for (const entry of store.entries) {
    if (entry.kind === 'coin-redeem') totals.redemptions += 1;
    if (entry.kind === 'admin-adjustment') totals.adminAdjustments += 1;
    if (entry.kind === 'billing-grant') {
      totals.billingGrants += 1;
      totals.revenueMinor += entry.amountMinor ?? 0;
    }
    const coins = entry.coins ?? 0;
    if (coins < 0) totals.coinsSpent += -coins;
    else totals.coinsIssued += coins;
  }
  return { entries: [...store.entries].reverse(), totals, updatedAt: store.updatedAt };
}

/** Test helper. */
export function resetLedgerMemory(): void {
  memoryFallback.store = null;
}
