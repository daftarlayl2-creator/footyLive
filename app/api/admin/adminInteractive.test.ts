import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GET as listUsers, POST as mutateUser } from './users/route';
import { GET as getInboxDesk, POST as postInboxDesk } from './inbox/route';
import { registerViewer, resetAdminUsersMemory } from '@/lib/admin/users';
import { resetAdminVipMemory, viewerVipRecord } from '@/lib/admin/vip';
import { loadWallet, resetWalletMemory } from '@/lib/coins/server';
import { readInbox, resetInboxMemory } from '@/lib/inbox/server';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/adminAuth';
import { LIMON_ELITE_ID } from '@/lib/seed/limonElite';

const NOW = Date.parse('2026-10-16T16:00:00Z');
const VIEWER = 'viewer-mutation-target-77';

beforeEach(async () => {
  store.clear();
  resetAdminUsersMemory();
  resetAdminVipMemory();
  resetWalletMemory();
  resetInboxMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  await registerViewer(VIEWER, { now: NOW, handle: 'GoalHunter' });
});

const adminHeaders = () => ({
  cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken(NOW)}`,
  'Content-Type': 'application/json',
});

describe('Interactive admin command center mutations (/api/admin/users)', () => {
  it('assigns and updates VIP tiers, granting active entitlement window', async () => {
    // Assign Diamond tier (365 days)
    const assignRes = await mutateUser(
      new Request('https://limonlive.app/api/admin/users', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ id: VIEWER, action: 'vip', tier: 'diamond', days: 365, note: 'Special MVP' }),
      })
    );
    expect(assignRes.status).toBe(200);
    const assignBody = await assignRes.json();
    expect(assignBody.ok).toBe(true);
    expect(assignBody.tier).toBe('diamond');
    expect(assignBody.expiresAt).toBe(NOW + 365 * 86_400_000);

    // Verify stored VIP record
    const record = await viewerVipRecord(VIEWER, NOW);
    expect(record?.tier).toBe('diamond');
    expect(record?.planId).toBe('annual');

    // Notification receipt was delivered to the user's inbox
    const inbox = await readInbox(VIEWER);
    expect(inbox.messages.some((m) => m.kind === 'vip' && m.subject.includes('Diamond'))).toBe(true);

    // Revoke tier (set to free)
    const revokeRes = await mutateUser(
      new Request('https://limonlive.app/api/admin/users', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ id: VIEWER, action: 'vip', tier: 'free' }),
      })
    );
    expect(revokeRes.status).toBe(200);
    expect((await revokeRes.json()).tier).toBe('free');
    expect(await viewerVipRecord(VIEWER, NOW)).toBeNull();
  });

  it('sets explicit coin balances directly', async () => {
    const setRes = await mutateUser(
      new Request('https://limonlive.app/api/admin/users', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ id: VIEWER, action: 'set-balance', balance: 50_000 }),
      })
    );
    expect(setRes.status).toBe(200);
    expect((await setRes.json()).balance).toBe(50_000);

    const wallet = await loadWallet(VIEWER);
    expect(wallet.balance).toBe(50_000);
  });

  it('sends styled direct message from chosen sender identity to user inbox', async () => {
    const msgRes = await mutateUser(
      new Request('https://limonlive.app/api/admin/users', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          id: VIEWER,
          action: 'message',
          from: 'admin',
          subject: 'Exclusive backstage stream link',
          body: 'Here is your direct FHD tunnel for the cup final.',
        }),
      })
    );
    expect(msgRes.status).toBe(200);

    const inbox = await readInbox(VIEWER);
    const found = inbox.messages.find((m) => m.from === 'admin');
    expect(found).toBeDefined();
    expect(found?.subject).toBe('Exclusive backstage stream link');
  });

  it('lists users enriched with live balances, flairs, and auto-seeded LimonElite', async () => {
    const listRes = await listUsers(
      new Request('https://limonlive.app/api/admin/users', { headers: adminHeaders() })
    );
    expect(listRes.status).toBe(200);
    const body = await listRes.json();

    // Verify LimonElite spy account is present
    const elite = body.users.find((u: any) => u.id === LIMON_ELITE_ID || u.handle === 'LimonElite');
    expect(elite).toBeDefined();
    expect(elite.balance).toBe(9_000_000_000);
  });
});

describe('Admin inbox management desk (/api/admin/inbox)', () => {
  it('lists available sender identities and recipients', async () => {
    const res = await getInboxDesk(
      new Request('https://limonlive.app/api/admin/inbox', { headers: adminHeaders() })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.senders).toHaveLength(3);
    expect(body.senders.map((s: any) => s.id)).toEqual(['platform', 'admin', 'support']);
    expect(body.recipients.length).toBeGreaterThanOrEqual(1);
  });

  it('broadcasts announcements to all viewers', async () => {
    const broadcastRes = await postInboxDesk(
      new Request('https://limonlive.app/api/admin/inbox', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          action: 'send',
          to: 'all',
          from: 'platform',
          subject: 'Server maintenance scheduled',
          body: 'Maintenance completed with 0 downtime.',
        }),
      })
    );
    expect(broadcastRes.status).toBe(200);
    const body = await broadcastRes.json();
    expect(body.ok).toBe(true);
    expect(body.broadcast).toBe(true);
    expect(body.delivered).toBeGreaterThanOrEqual(1);
  });
});
