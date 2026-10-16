import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  // NOTE: under the oxc transform the mock factory can be evaluated more than
  // once per module graph, so anchor the store on globalThis to guarantee the
  // test and the module under test always share one instance.
  const g = globalThis as { __LIMON_TEST_CACHE_STORE__?: Map<string, unknown> };
  if (!g.__LIMON_TEST_CACHE_STORE__) g.__LIMON_TEST_CACHE_STORE__ = new Map<string, unknown>();
  const store = g.__LIMON_TEST_CACHE_STORE__;
  return {
    getCacheManager: () => ({
      get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
      set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
    }),
    // Test-only: the store lives inside the factory so resets always hit the
    // exact instance the module under test writes to (no hoisted-binding drift).
    __resetStore: () => store.clear(),
  };
});
import * as cacheManagerMock from '@/lib/cache/cacheManager';
const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { adjustViewerCoins, isViewerBanned, listAdminUsers, registerViewer, resetAdminUsersMemory, setViewerBanned } from './users';
import { ledgerSnapshot, resetLedgerMemory } from './ledger';
import { resetWalletMemory } from '@/lib/coins/server';
import { adminSessionFromCookies } from './guard';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/adminAuth';

const NOW = Date.parse('2026-10-16T15:00:00Z');
const VIEWER = 'viewer-abc123def456';

beforeEach(() => {
  __resetStore();
  resetAdminUsersMemory();
  resetLedgerMemory();
  resetWalletMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

describe('viewer registry', () => {
  it('registers presence and keeps the freshest rows first', async () => {
    await registerViewer(VIEWER, { path: '/watch/42', pageview: true, now: NOW - 1000 });
    await registerViewer('viewer-bbb222ccc333', { pageview: true, now: NOW });
    const users = await listAdminUsers();
    expect(users.length).toBe(2);
    expect(users[0].id).toBe('viewer-bbb222ccc333');
    const row = users.find((u) => u.id === VIEWER)!;
    expect(row.pageviews).toBe(1);
    expect(row.lastPath).toBe('/watch/42');
    expect(row.banned).toBe(false);
    expect(await isViewerBanned(VIEWER)).toBe(false);
  });

  it('ban / unban round-trips server-side', async () => {
    await registerViewer(VIEWER, { now: NOW });
    const banned = await setViewerBanned(VIEWER, true, 'abuse');
    expect(banned.ok).toBe(true);
    expect(await isViewerBanned(VIEWER)).toBe(true);
    expect((await listAdminUsers())[0].banReason).toBe('abuse');

    const unbanned = await setViewerBanned(VIEWER, false);
    expect(unbanned.ok).toBe(true);
    expect(await isViewerBanned(VIEWER)).toBe(false);
    expect((await listAdminUsers())[0].banReason).toBe('');
  });

  it('refuses to ban unknown or malformed ids', async () => {
    expect((await setViewerBanned('nobody-real-9', true)).ok).toBe(false);
    expect((await setViewerBanned('<script>', true)).ok).toBe(false);
    expect(await isViewerBanned('')).toBe(false);
  });
});

describe('coin adjustments', () => {
  it('applies deltas to the authoritative wallet and writes a ledger row', async () => {
    await registerViewer(VIEWER, { now: NOW });
    const plus = await adjustViewerCoins(VIEWER, 5000, 'good karma', NOW);
    expect(plus.ok).toBe(true);
    expect(plus.wallet?.balance).toBe(5000);

    const minus = await adjustViewerCoins(VIEWER, -1500, 'corrrection', NOW);
    expect(minus.wallet?.balance).toBe(3500);

    const ledger = await ledgerSnapshot();
    expect(ledger.entries.length).toBe(2);
    expect(ledger.entries[0]).toMatchObject({ kind: 'admin-adjustment', userId: VIEWER, coins: -1500, balanceAfter: 3500 });
    expect(ledger.totals.coinsIssued).toBe(5000);
    expect(ledger.totals.coinsSpent).toBe(1500);
    expect(ledger.totals.adminAdjustments).toBe(2);
  });

  it('never drives a balance below zero and rejects wild deltas', async () => {
    await registerViewer(VIEWER, { now: NOW });
    expect((await adjustViewerCoins(VIEWER, -10)).ok).toBe(false);
    expect((await adjustViewerCoins(VIEWER, 0)).ok).toBe(false);
    expect((await adjustViewerCoins(VIEWER, 5_000_000)).ok).toBe(false);
    expect((await adjustViewerCoins('<script>', 100)).ok).toBe(false);
  });
});

describe('admin session guard', () => {
  it('accepts only a valid signed admin cookie', () => {
    const token = createAdminSessionToken(NOW);
    expect(adminSessionFromCookies(`${ADMIN_SESSION_COOKIE}=${token}`)).toBe(token);
    expect(adminSessionFromCookies(`${ADMIN_SESSION_COOKIE}=${token}`)).not.toBeNull();
    expect(adminSessionFromCookies(`${ADMIN_SESSION_COOKIE}=forged.signature`)).toBeNull();
    expect(adminSessionFromCookies(null)).toBeNull();
    expect(adminSessionFromCookies('other=1')).toBeNull();
  });
});
