/**
 * Big-ticket redemptions: 20,000+ coin purchases must deduct instantly, grant
 * the perk in the same write, and never answer with a vague refusal.
 *
 * The old Rewards Store rejected Badges and Boosts with "reward not valid" while
 * advertising them. These tests pin the fixes: every catalogue reward is
 * redeemable, every refusal reason has a specific sentence, and the phrase that
 * used to appear on screen is gone from the user-facing copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  const store = new Map<string, unknown>();
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

import { EMPTY_WALLET, loadWallet, redeemReward, resetWalletMemory, saveWallet } from '@/lib/coins/server';
import { REWARD_LIST, findReward } from '@/lib/rewards/catalog';
import { REDEEM_FAILURE_REASONS, REDEEM_MESSAGES, fallbackMessage, redeemFailureMessage } from './messages';
import { readFileSync } from 'node:fs';

const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;
const WHALE = 'viewer-whale-0001';
const NOW = Date.parse('2026-10-16T16:00:00Z');

beforeEach(() => {
  __resetStore();
  resetWalletMemory();
});

describe('20,000+ coin purchases', () => {
  it('buys the flagship 1-month pass (20,000) and leaves the right balance', async () => {
    await saveWallet(WHALE, { ...EMPTY_WALLET, balance: 20_000 });
    const result = await redeemReward(WHALE, 'vip-1-month', NOW);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.wallet.balance).toBe(0);
    expect(result.coinGrant?.kind).toBe('vip');
    expect((await loadWallet(WHALE)).balance).toBe(0);
  });

  it('buys the 180,000 coin annual pass in one write', async () => {
    await saveWallet(WHALE, { ...EMPTY_WALLET, balance: 200_000 });
    const result = await redeemReward(WHALE, 'vip-1-year', NOW + 1000);
    expect(result.ok).toBe(true);
    expect(result.wallet.balance).toBe(20_000);
    expect(result.grant?.expiresAt).toBe(NOW + 1000 + 365 * 86_400_000);
    const stored = await loadWallet(WHALE);
    expect(stored.grants.filter((grant) => grant.kind === 'vip')).toHaveLength(1);
    expect(stored.redemptions[0]).toMatchObject({ rewardId: 'vip-1-year', coins: 180_000 });
  });

  it('makes every reward on the menu buyable — no "unknown reward" path left', async () => {
    for (const reward of REWARD_LIST) {
      resetWalletMemory();
      __resetStore();
      await saveWallet(WHALE, { ...EMPTY_WALLET, balance: reward.cost * 2 });
      const result = await redeemReward(WHALE, reward.id, NOW);
      expect(result.ok, `${reward.id} should be redeemable`).toBe(true);
      expect(result.wallet.balance, `${reward.id} should deduct instantly`).toBe(reward.cost);
      expect(result.reason, `${reward.id} should not be refused`).toBeUndefined();
      expect(await loadWallet(WHALE)).toMatchObject({ balance: reward.cost });
    }
  });

  it('states the exact shortfall instead of a generic refusal', async () => {
    await saveWallet(WHALE, { ...EMPTY_WALLET, balance: 19_999 });
    const result = await redeemReward(WHALE, 'vip-1-month', NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient-coins');
    const message = redeemFailureMessage(result.reason, { cost: 20_000, title: 'VIP Pass · 1 month', needed: 1 });
    expect(message.status).toBe(409);
    expect(message.error).toContain('1 more Limon Coin');
    expect(message.error).toContain('20,000');
    // The balance is untouched by a refused purchase.
    expect((await loadWallet(WHALE)).balance).toBe(19_999);
  });
});

describe('refusal vocabulary', () => {
  it('has a specific sentence for every reason the engine can return', () => {
    for (const reason of REDEEM_FAILURE_REASONS) {
      const message = REDEEM_MESSAGES[reason]({ cost: 20_000, title: 'VIP Pass · 1 month', needed: 500 });
      expect(message.error.length, reason).toBeGreaterThan(20);
      expect(message.status).toBeGreaterThanOrEqual(400);
      expect(message.error.toLowerCase()).not.toContain('reward not valid');
      expect(message.error.toLowerCase()).not.toContain('unknown error');
    }
    expect(REDEEM_FAILURE_REASONS).toContain('insufficient-coins');
    expect(REDEEM_FAILURE_REASONS).toContain('unknown-reward');
  });

  it('falls back to honest copy that promises the coins are safe', () => {
    const message = redeemFailureMessage(undefined, { cost: 1_200, title: 'VIP Pass · 24 hours', needed: 0 });
    expect(message).toEqual(fallbackMessage());
    expect(message.error).toContain('your coins are safe');
  });

  it('keeps the store front-end free of the old "reward not valid" screen', () => {
    const store = readFileSync('components/coins/RewardsStore.jsx', 'utf8');
    const walletRoute = readFileSync('app/api/wallet/route.ts', 'utf8');
    for (const source of [store, walletRoute]) {
      expect(source.toLowerCase()).not.toContain('reward not valid');
      expect(source.toLowerCase()).not.toContain('invalid reward');
    }
    // The catalogue still documents the history — that comment is the reason the
    // single-source-of-truth design exists.
    expect(readFileSync('lib/rewards/catalog.ts', 'utf8').toLowerCase()).toContain('reward not valid');
    expect(findReward('vip-1-month')?.cost).toBe(20_000);
  });
});
