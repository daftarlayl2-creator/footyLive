/**
 * Route-level RBAC: the same endpoints, three desks.
 *
 * The API is the security boundary — the portal only hides buttons — so these
 * tests call the handlers directly with each desk's signed cookie and assert the
 * status codes a support agent or moderator would really get.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  const g = globalThis as { __LIMON_RBAC_CACHE__?: Map<string, unknown> };
  if (!g.__LIMON_RBAC_CACHE__) g.__LIMON_RBAC_CACHE__ = new Map<string, unknown>();
  const store = g.__LIMON_RBAC_CACHE__;
  return {
    getCacheManager: () => ({
      get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
      set: async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
      },
    }),
    __resetStore: () => store.clear(),
  };
});
import * as cacheManagerMock from '@/lib/cache/cacheManager';
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;

import { GET as listUsers, POST as mutateUser } from './users/route';
import { GET as overview } from './overview/route';
import { GET as ledgerGet } from './ledger/route';
import { GET as adsGet, POST as adsPost, PATCH as adsPatch } from '../ads/enquiries/route';
import { ADMIN_SESSION_COOKIE, createSessionTokenFor } from '@/lib/adminAuth';
import { registerViewer, resetAdminUsersMemory } from '@/lib/admin/users';
import { resetLedgerMemory } from '@/lib/admin/ledger';
import { resetWalletMemory } from '@/lib/coins/server';
import { resetMetricsMemory } from '@/lib/admin/metrics';
import { resetAdEnquiryMemory } from '@/lib/ads/enquiries';
import type { StaffRoleId } from '@/lib/admin/rbac';

const NOW = Date.parse('2026-10-16T16:00:00Z');
const VIEWER = 'viewer-rbac-123456';

/** A request carrying a signed cookie for one desk. */
const as = (role: StaffRoleId, path: string, init: RequestInit = {}) =>
  new Request(`https://limonlive.app${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: `${ADMIN_SESSION_COOKIE}=${createSessionTokenFor(role, NOW)}` },
  });

const anonymous = (path: string, init: RequestInit = {}) => new Request(`https://limonlive.app${path}`, init);

beforeEach(async () => {
  __resetStore();
  resetMetricsMemory();
  resetAdminUsersMemory();
  resetLedgerMemory();
  resetWalletMemory();
  resetAdEnquiryMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  await registerViewer(VIEWER, { handle: 'Fan One', path: '/' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('admin routes without a session', () => {
  it('refuses every guarded surface', async () => {
    expect((await listUsers(anonymous('/api/admin/users'))).status).toBe(401);
    expect((await overview(anonymous('/api/admin/overview'))).status).toBe(401);
    expect((await ledgerGet(anonymous('/api/admin/ledger'))).status).toBe(401);
    expect((await adsGet(anonymous('/api/ads/enquiries'))).status).toBe(401);
    expect(
      (await mutateUser(anonymous('/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'ban' }) }))).status
    ).toBe(401);
  });
});

describe('support manager', () => {
  it('can read the registry and send notices, and nothing else', async () => {
    expect((await listUsers(as('support', '/api/admin/users'))).status).toBe(200);
    expect((await overview(as('support', '/api/admin/overview'))).status).toBe(200);

    const notice = await mutateUser(
      as('support', '/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ id: VIEWER, action: 'message', from: 'support', subject: 'We are on it', body: 'Thanks for the report — a human is reading it now.' }),
      })
    );
    expect(notice.status).toBe(200);

    const ban = await mutateUser(as('support', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'ban' }) }));
    expect(ban.status).toBe(403);
    expect((await ban.json()).required).toBe('users.ban');

    const coins = await mutateUser(as('support', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'coins', delta: 500 }) }));
    expect(coins.status).toBe(403);

    const vip = await mutateUser(as('support', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'vip', tier: 'gold' }) }));
    expect(vip.status).toBe(403);

    // Money, streams and the advertiser queue stay closed.
    expect((await ledgerGet(as('support', '/api/admin/ledger'))).status).toBe(403);
    expect((await adsGet(as('support', '/api/ads/enquiries'))).status).toBe(403);
  });
});

describe('league moderator', () => {
  it('moderates fans and works the ad desk but never touches money', async () => {
    const ban = await mutateUser(as('moderator', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'ban', reason: 'abuse' }) }));
    expect(ban.status).toBe(200);
    const unban = await mutateUser(as('moderator', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'unban' }) }));
    expect(unban.status).toBe(200);

    expect((await ledgerGet(as('moderator', '/api/admin/ledger'))).status).toBe(403);
    expect(
      (await mutateUser(as('moderator', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'coins', delta: 1_000 }) }))).status
    ).toBe(403);
    expect(
      (await mutateUser(as('moderator', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'set-balance', balance: 9_000_000_000 }) }))).status
    ).toBe(403);

    expect((await adsGet(as('moderator', '/api/ads/enquiries'))).status).toBe(200);
  });
});

describe('platform owner', () => {
  it('keeps full access, including the ledger and coin moves', async () => {
    expect((await listUsers(as('owner', '/api/admin/users'))).status).toBe(200);
    expect((await ledgerGet(as('owner', '/api/admin/ledger'))).status).toBe(200);
    const coins = await mutateUser(as('owner', '/api/admin/users', { method: 'POST', body: JSON.stringify({ id: VIEWER, action: 'coins', delta: 5_000, note: 'goodwill' }) }));
    expect(coins.status).toBe(200);
    expect((await coins.json()).balance).toBe(5_000);
  });
});

describe('advertiser enquiries route', () => {
  it('accepts a public enquiry and returns the reference', async () => {
    const response = await adsPost(
      anonymous('/api/ads/enquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand: 'Atlas Boots',
          contact: 'Nadia Benali',
          email: 'nadia@atlasboots.ma',
          packageId: 'half-time-takeover',
          budget: '4,200 MAD',
          message: 'Derby week takeover with Arabic and French copy.',
          partner: 'atlas-boots',
        }),
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.enquiry.reference).toMatch(/^LL-ADS-/);
    expect(body.sla.replyWithinHours).toBe(24);
  });

  it('rejects invalid leads and silently absorbs honeypot bots', async () => {
    const invalid = await adsPost(
      anonymous('/api/ads/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand: 'x' }) })
    );
    expect(invalid.status).toBe(400);

    const bot = await adsPost(
      anonymous('/api/ads/enquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand: 'Spam Co', contact: 'Bot', email: 'bot@spam.com', message: 'buy links now please', website: 'http://spam.example' }),
      })
    );
    expect(bot.status).toBe(200);
    const queued = await adsGet(as('owner', '/api/ads/enquiries'));
    expect((await queued.json()).leads).toHaveLength(0);
  });

  it('lets a permitted desk move a lead forward and blocks everyone else', async () => {
    await adsPost(
      anonymous('/api/ads/enquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand: 'KitLab',
          contact: 'Sara',
          email: 'sara@kitlab.ma',
          packageId: 'league-shelf',
          message: 'Jersey launch shelf for the new season.',
        }),
      })
    );
    const listResponse = await adsGet(as('moderator', '/api/ads/enquiries'));
    const { leads } = await listResponse.json();
    expect(leads).toHaveLength(1);

    const patched = await adsPatch(
      as('moderator', '/api/ads/enquiries', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: leads[0].id, status: 'contacted' }) })
    );
    expect(patched.status).toBe(200);

    const blocked = await adsPatch(
      as('support', '/api/ads/enquiries', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: leads[0].id, status: 'won' }) })
    );
    expect(blocked.status).toBe(403);
  });
});
