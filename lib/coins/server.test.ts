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
  EMPTY_WALLET,
  activeRedemption,
  coinGrants,
  creditPredictionReward,
  loadCoinGrants,
  loadWallet,
  redeemVipReward,
  resetWalletMemory,
  sanitizeWallet,
  saveWallet,
} from './server';
import { createWalletViewer, verifyWalletViewer, walletCookieFromHeader, WALLET_COOKIE } from './session';
import { REWARD_CORRECT_PREDICTION, VIP_PASS_COIN_COST } from '@/lib/coins';

const USER = 'a3f1c2d4-1111-4222-8333-444455556666';
const NOW = Date.parse('2026-10-16T12:00:00Z');

beforeEach(() => {
  store.clear();
  resetWalletMemory();
});

describe('signed wallet viewer cookie', () => {
  it('mints an id the server can verify and rejects forged or edited cookies', () => {
    const created = createWalletViewer('s'.repeat(40));
    expect(verifyWalletViewer(created.cookie, 's'.repeat(40))).toBe(created.id);
    // Another secret (i.e. someone hand-crafting a wallet id) is refused.
    expect(verifyWalletViewer(created.cookie, 'x'.repeat(40))).toBeNull();
    expect(verifyWalletViewer(`${created.id}.${'0'.repeat(64)}`, 's'.repeat(40))).toBeNull();
    expect(verifyWalletViewer('not-a-cookie', 's'.repeat(40))).toBeNull();
    expect(verifyWalletViewer(null, 's'.repeat(40))).toBeNull();
  });

  it('reads only its own cookie out of a Cookie header', () => {
    expect(walletCookieFromHeader(`theme=dark; ${WALLET_COOKIE}=abc.def; other=1`)).toBe('abc.def');
    expect(walletCookieFromHeader('theme=dark')).toBeNull();
    expect(walletCookieFromHeader(undefined)).toBeNull();
  });
});

describe('server wallet', () => {
  it('starts empty and sanitises hostile payloads', () => {
    expect(EMPTY_WALLET.balance).toBe(0);
    const dirty = sanitizeWallet({
      balance: -50,
      awards: [{ matchId: 'm1', coins: 500, at: 5 }, { matchId: '', coins: 999 }, null],
      redemptions: [{ rewardId: 'vip-1-month', coins: 20000, at: 1, expiresAt: 2 }, { rewardId: 'x' }],
    });
    expect(dirty.balance).toBe(0);
    expect(dirty.awards).toEqual([{ matchId: 'm1', coins: 500, at: 5, reason: 'correct-prediction' }]);
    expect(dirty.redemptions).toHaveLength(1);
    expect(sanitizeWallet('junk')).toMatchObject({ balance: 0, awards: [] });
  });

  it('credits a prediction reward once per match, however many times it is asked', async () => {
    const first = await creditPredictionReward(USER, 'espn-1', REWARD_CORRECT_PREDICTION, NOW);
    expect(first.credited).toBe(REWARD_CORRECT_PREDICTION);
    const replay = await creditPredictionReward(USER, 'espn-1', REWARD_CORRECT_PREDICTION, NOW + 1000);
    expect(replay.credited).toBe(0);
    const other = await creditPredictionReward(USER, 'espn-2', REWARD_CORRECT_PREDICTION, NOW + 2000);
    expect(other.wallet.balance).toBe(REWARD_CORRECT_PREDICTION * 2);
    expect(other.wallet.awards.map((award) => award.matchId)).toEqual(['espn-1', 'espn-2']);
  });

  it('refuses a redemption without enough coins and never returns a grant', async () => {
    const poor = await redeemVipReward(USER, NOW);
    expect(poor).toMatchObject({ ok: false, reason: 'insufficient-coins' });
    expect(poor.grant).toBeUndefined();
    expect((await loadWallet(USER)).balance).toBe(0);
    expect(await redeemVipReward('', NOW)).toMatchObject({ ok: false, reason: 'missing-viewer' });
  });

  it('exchanges 20,000 coins for a 30-day VIP grant that the subscription layer can use', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST + 750 });
    const redeemed = await redeemVipReward(USER, NOW);
    expect(redeemed.ok).toBe(true);
    expect(redeemed.wallet.balance).toBe(750);
    expect(redeemed.grant).toMatchObject({ planId: 'monthly', source: 'eviv-coins', startsAt: NOW });
    expect(redeemed.grant!.expiresAt).toBe(NOW + 30 * 86_400_000);

    const grants = await loadCoinGrants(USER, NOW + 1000);
    expect(grants).toEqual([{
      id: redeemed.grant!.id, planId: 'monthly', startsAt: NOW, expiresAt: NOW + 30 * 86_400_000,
    }]);
    expect(await loadCoinGrants(USER, NOW + 31 * 86_400_000)).toEqual([]);
    expect(activeRedemption(redeemed.wallet, 'vip-1-month', NOW + 1000)).toMatchObject({ rewardId: 'vip-1-month' });
  });

  it('stacks a second redemption onto the running pass instead of losing it', async () => {
    await saveWallet(USER, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST * 2 });
    const first = await redeemVipReward(USER, NOW);
    const second = await redeemVipReward(USER, NOW + 60_000);
    expect(second.wallet.balance).toBe(0);
    expect(second.grant!.startsAt).toBe(first.grant!.expiresAt);
    expect(second.grant!.expiresAt).toBe(first.grant!.expiresAt + 30 * 86_400_000);
    expect(coinGrants(second.wallet, NOW + 60_000)).toHaveLength(2);
  });

  it('contains no client-writable path to a balance', async () => {
    // Only the server writes the wallet record; there is no exported setter that
    // accepts a client payload, and an unknown user is always a zero wallet.
    expect(await loadWallet('somebody-else')).toMatchObject({ balance: 0, awards: [] });
    const wallet = await loadWallet(USER);
    expect(Object.isFrozen(wallet)).toBe(false);
    expect(wallet.balance).toBe(0);
  });
});
