import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  REWARD_LIST,
  findReward,
  isRewardId,
  rewardCost,
  rewardBoost,
  rewardDurationMs,
} from './catalog';
import {
  EMPTY_WALLET,
  boostCharges,
  coinGrants,
  creditPredictionReward,
  loadCoinGrants,
  loadWallet,
  ownedFlairs,
  redeemReward,
  resetWalletMemory,
  saveWallet,
} from '@/lib/coins/server';
import { redemptionReceipt } from './receipts';

const USER = 'fan-test-redemption-999';
const NOW = Date.parse('2026-10-16T12:00:00Z');

beforeEach(() => {
  store.clear();
  resetWalletMemory();
});

describe('Rewards Store catalogue', () => {
  it('offers VIP passes, collector badges, and prediction boosts with positive prices', () => {
    expect(REWARD_LIST.length).toBeGreaterThanOrEqual(7);
    for (const reward of REWARD_LIST) {
      expect(reward.cost).toBeGreaterThan(0);
      expect(isRewardId(reward.id)).toBe(true);
      expect(rewardCost(reward.id)).toBe(reward.cost);
      expect(reward.title).toBeTruthy();
      expect(reward.titleAr).toBeTruthy();
    }
  });

  it('correctly calculates durations for VIP passes and 0 for non-VIP', () => {
    const vipMonth = findReward('vip-1-month');
    expect(rewardDurationMs(vipMonth)).toBe(30 * 24 * 60 * 60 * 1000);
    const badge = findReward('coin-badge');
    expect(rewardDurationMs(badge)).toBe(0);
  });

  it('correctly derives boost multiplier and charges', () => {
    const boost = findReward('coin-boost');
    expect(rewardBoost(boost)).toEqual({ multiplier: 2, charges: 1 });
    const mega = findReward('coin-boost-mega');
    expect(rewardBoost(mega)).toEqual({ multiplier: 3, charges: 3 });
    expect(rewardBoost(findReward('coin-badge'))).toBeNull();
  });
});

describe('atomic redemption engine & balance deduction', () => {
  it('deducts coin balance instantly and grants VIP pass without validation errors', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: 25_000 });
    const result = await redeemReward(USER, 'vip-1-month', NOW);

    expect(result.ok).toBe(true);
    expect(result.wallet.balance).toBe(5_000); // 25,000 - 20,000
    expect(result.remaining).toBe(5_000);
    expect(result.grant).toMatchObject({ planId: 'monthly', startsAt: NOW, source: 'eviv-coins' });
    expect(result.grant?.expiresAt).toBe(NOW + 30 * 86_400_000);

    // Verify stored wallet state
    const loaded = await loadWallet(USER);
    expect(loaded.balance).toBe(5_000);
    expect(loaded.grants).toHaveLength(1);
    expect(loaded.grants[0].kind).toBe('vip');

    // Entitlement integration
    const subGrants = await loadCoinGrants(USER, NOW + 1000);
    expect(subGrants).toHaveLength(1);
    expect(subGrants[0].planId).toBe('monthly');
  });

  it('refuses redemption when coins are insufficient and never mutates balance', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: 1_000 });
    const result = await redeemReward(USER, 'vip-1-month', NOW);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-coins');
    expect(result.wallet.balance).toBe(1_000);

    const reloaded = await loadWallet(USER);
    expect(reloaded.balance).toBe(1_000);
    expect(reloaded.grants).toHaveLength(0);
  });

  it('deducts coins and unlocks permanent supporter badge', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: 5_000 });
    const result = await redeemReward(USER, 'coin-badge', NOW);

    expect(result.ok).toBe(true);
    expect(result.wallet.balance).toBe(2_500); // 5000 - 2500
    expect(result.coinGrant?.kind).toBe('badge');
    expect(result.coinGrant?.flair).toBe('supporter');
    expect(ownedFlairs(result.wallet)).toContain('supporter');

    // Trying to redeem the same permanent badge again is rejected
    const secondTry = await redeemReward(USER, 'coin-badge', NOW + 1000);
    expect(secondTry.ok).toBe(false);
    expect(secondTry.reason).toBe('badge-owned');
    expect(secondTry.wallet.balance).toBe(2_500); // no double charge
  });

  it('deducts coins and equips prediction boost multiplier, consumed on correct prediction', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: 10_000 });
    const result = await redeemReward(USER, 'coin-boost', NOW);

    expect(result.ok).toBe(true);
    expect(result.wallet.balance).toBe(8_500); // 10,000 - 1,500
    expect(boostCharges(result.wallet)).toBe(1);

    // Predict correctly on a match: payout is doubled (500 * 2 = 1000)
    const payout = await creditPredictionReward(USER, 'espn-match-boosted', 500, NOW + 5000);
    expect(payout.multiplier).toBe(2);
    expect(payout.credited).toBe(1_000);
    expect(payout.wallet.balance).toBe(9_500); // 8,500 + 1,000

    // Boost charge should now be consumed
    expect(boostCharges(payout.wallet)).toBe(0);

    // Next prediction only gets base 500
    const nextPayout = await creditPredictionReward(USER, 'espn-match-regular', 500, NOW + 10000);
    expect(nextPayout.multiplier).toBe(1);
    expect(nextPayout.credited).toBe(500);
    expect(nextPayout.wallet.balance).toBe(10_000);
  });

  it('stacks multiple VIP passes sequentially onto the active window', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: 40_000 });
    const first = await redeemReward(USER, 'vip-1-month', NOW);
    const second = await redeemReward(USER, 'vip-1-month', NOW + 60_000);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.wallet.balance).toBe(0);

    // Stacked timing: second pass begins when first expires
    expect(second.grant?.startsAt).toBe(first.grant?.expiresAt);
    expect(second.grant?.expiresAt).toBe(first.grant!.expiresAt + 30 * 86_400_000);
    expect(coinGrants(second.wallet, NOW + 60_000)).toHaveLength(2);
  });

  it('generates an official bilingual confirmation receipt for inbox delivery', () => {
    const reward = findReward('vip-1-month')!;
    const dummyWallet = { ...EMPTY_WALLET, balance: 5_000 };
    const dummyGrant = {
      id: 'grant-vip-1',
      rewardId: 'vip-1-month',
      kind: 'vip' as const,
      coins: 20_000,
      at: NOW,
      expiresAt: NOW + 30 * 86_400_000,
      label: reward.title,
    };
    const receipt = redemptionReceipt(reward, dummyGrant, dummyWallet);

    expect(receipt.from).toBe('platform');
    expect(receipt.kind).toBe('receipt');
    expect(receipt.reference).toMatch(/^LL-RCPT-/);
    expect(receipt.subject).toContain('20,000 Limon Coins spent');
    expect(receipt.subjectAr).toContain('تم تفعيل');
    expect(receipt.lines).toBeDefined();
    expect(receipt.lines?.some((l) => l.label === 'Coins spent' && l.value === '−20,000')).toBe(true);
  });
});
