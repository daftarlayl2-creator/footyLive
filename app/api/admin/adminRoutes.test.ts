/**
 * Route-level coverage: the analytics beacon and the admin API surface.
 */
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

import { POST as beacon } from '../analytics/route';
import { GET as overview } from './overview/route';
import { GET as listUsers, POST as mutateUser } from './users/route';
import { GET as ledgerGet } from './ledger/route';
import { resetMetricsMemory } from '@/lib/admin/metrics';
import { registerViewer, resetAdminUsersMemory } from '@/lib/admin/users';
import { resetLedgerMemory } from '@/lib/admin/ledger';
import { resetWalletMemory } from '@/lib/coins/server';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/adminAuth';

const NOW = Date.parse('2026-10-16T16:00:00Z');

beforeEach(() => {
  __resetStore();
  resetMetricsMemory();
  resetAdminUsersMemory();
  resetLedgerMemory();
  resetWalletMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

const adminHeaders = () => ({ cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken(NOW)}` });

describe('POST /api/analytics', () => {
  it('accepts a beacon batch and rolls it into analytics aggregates', async () => {
    const payload = {
      sid: 'visit-beacon-001',
      at: NOW,
      events: [
        { type: 'pageview', path: '/' },
        { type: 'impression', slot: 'home-top' },
        { type: 'click', slot: 'home-top' },
        { type: 'heartbeat' },
      ],
    };
    for (let round = 0; round < 2; round += 1) {
      const response = await beacon(new Request('https://limonlive.app/api/analytics', { method: 'POST', body: JSON.stringify(payload) }));
      expect(response.status).toBe(204);
    }
    const snap = await overview(new Request('https://limonlive.app/api/admin/overview', { headers: adminHeaders() }));
    expect(snap.status).toBe(200);
    const body = await snap.json();
    expect(body.metrics.totals.impressions).toBe(2);
    expect(body.metrics.totals.clicks).toBe(2);
    expect(body.metrics.totals.ctr).toBe(100);
    expect(body.metrics.liveVisitors).toBe(1);
  });

  it('ignores junk bodies and junk sids without leaking anything', async () => {
    expect((await beacon(new Request('https://limonlive.app/api/analytics', { method: 'POST', body: 'not json' }))).status).toBe(204);
    expect((await beacon(new Request('https://limonlive.app/api/analytics', { method: 'POST', body: JSON.stringify({ sid: '!!!', events: [] }) }))).status).toBe(204);
    const snap = await overview(new Request('https://limonlive.app/api/admin/overview', { headers: adminHeaders() }));
    const body = await snap.json();
    expect(body.metrics.totals.pageviews).toBe(0);
  });
});

describe('admin API authorization', () => {
  it('rejects every admin route without the signed session cookie', async () => {
    const requests = [
      overview(new Request('https://limonlive.app/api/admin/overview')),
      listUsers(new Request('https://limonlive.app/api/admin/users')),
      ledgerGet(new Request('https://limonlive.app/api/admin/ledger')),
      mutateUser(new Request('https://limonlive.app/api/admin/users', { method: 'POST', body: JSON.stringify({ id: 'x', action: 'ban' }) })),
    ];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(401);
    }
  });
});

describe('admin users actions', () => {
  it('bans via the API and reflects it in the registry', async () => {
    await registerViewer('viewer-banme-01', { now: NOW });
    const ban = await mutateUser(new Request('https://limonlive.app/api/admin/users', {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'viewer-banme-01', action: 'ban', reason: 'test ban' }),
    }));
    expect(ban.status).toBe(200);
    const body = await ban.json();
    expect(body.user.banned).toBe(true);

    const table = await (await listUsers(new Request('https://limonlive.app/api/admin/users', { headers: adminHeaders() }))).json();
    expect(table.users.find((row: any) => row.id === 'viewer-banme-01').banned).toBe(true);
  });

  it('adjusts coins via the API and lists the wallet balance', async () => {
    await registerViewer('viewer-rich-999', { now: NOW });
    const adjust = await mutateUser(new Request('https://limonlive.app/api/admin/users', {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'viewer-rich-999', action: 'coins', delta: 2500 }),
    }));
    expect(adjust.status).toBe(200);
    expect((await adjust.json()).balance).toBe(2500);

    const ledgerResponse = await ledgerGet(new Request('https://limonlive.app/api/admin/ledger', { headers: adminHeaders() }));
    const ledger = await ledgerResponse.json();
    expect(ledger.entries[0].coins).toBe(2500);
    expect(ledger.totals.coinsIssued).toBe(2500);
  });
});
