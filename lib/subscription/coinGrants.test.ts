import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { getRequestSubscription } from './server';
import { subscriptionAccess } from './plans';
import { resetWalletMemory, saveWallet, EMPTY_WALLET } from '@/lib/coins/server';
import { createWalletViewer, WALLET_COOKIE } from '@/lib/coins/session';
import { VIP_PASS_COIN_COST } from '@/lib/coins';

const SECRET = 's'.repeat(40);

beforeEach(() => {
  store.clear();
  resetWalletMemory();
  vi.useRealTimers();
  vi.stubEnv('STREAM_SECRET', SECRET);
});

function request(cookie?: string) {
  return new Request('https://limonlive.app/watch/espn-1', cookie ? { headers: { cookie } } : undefined);
}

describe('coin-bought VIP passes reach the playback access layer', () => {
  it('leaves an ordinary visitor on free HD with ads', async () => {
    const subscription = await getRequestSubscription(request());
    const access = subscriptionAccess(subscription.grants);
    expect(access).toMatchObject({ tier: 'free', maxHeight: 720, multiView: false, adFree: false });
  });

  it('unlocks VIP and Multi-View from a Rewards-Store redemption, verified server-side', async () => {
    const viewer = createWalletViewer(SECRET);
    await saveWallet(viewer.id, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST });
    // Spend the coins the way the Rewards Store does (server-side redemption).
    const { redeemVipReward } = await import('@/lib/coins/server');
    const redeemed = await redeemVipReward(viewer.id, Date.now());
    expect(redeemed.ok).toBe(true);

    const subscription = await getRequestSubscription(request(`${WALLET_COOKIE}=${viewer.cookie}`));
    const access = subscriptionAccess(subscription.grants, 'espn-1');
    expect(access).toMatchObject({ tier: 'vip', adFree: true, multiView: true, maxHeight: 2160, lowLatency: true });
    expect(access.expiresAt).toBe(redeemed.grant!.expiresAt);
  });

  it('ignores a forged wallet cookie, however plausible it looks', async () => {
    const viewer = createWalletViewer(SECRET);
    await saveWallet(viewer.id, {
      ...EMPTY_WALLET,
      redemptions: [{ rewardId: 'vip-1-month', coins: VIP_PASS_COIN_COST, at: Date.now(), expiresAt: Date.now() + 30 * 86_400_000 }],
    });
    // Correct id, wrong signature (client-crafted): no VIP.
    const forged = `${viewer.id}.${'0'.repeat(64)}`;
    const subscription = await getRequestSubscription(request(`${WALLET_COOKIE}=${forged}`));
    expect(subscriptionAccess(subscription.grants)).toMatchObject({ tier: 'free', multiView: false });
  });

  it('drops the pass once its 30 days are over', async () => {
    const viewer = createWalletViewer(SECRET);
    const now = Date.now();
    await saveWallet(viewer.id, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST });
    const { redeemVipReward } = await import('@/lib/coins/server');
    await redeemVipReward(viewer.id, now);
    vi.useFakeTimers({ now: now + 31 * 86_400_000, toFake: ['Date'] });
    const subscription = await getRequestSubscription(request(`${WALLET_COOKIE}=${viewer.cookie}`));
    expect(subscriptionAccess(subscription.grants)).toMatchObject({ tier: 'free' });
  });
});
