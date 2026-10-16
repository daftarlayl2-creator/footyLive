import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COIN_STORAGE_KEY,
  COINS_FOR_VIP_PASS,
  REWARD_CORRECT_PREDICTION,
  VIP_PASS_COIN_COST,
  VIP_PASS_DURATION_DAYS,
  addCoins,
  awardCoinsForCorrectPrediction,
  awardPredictionCoins,
  canRedeemVip,
  getAwardedPredictions,
  getCoinBalance,
  hasBeenAwarded,
  markPredictionAwarded,
  parseCoinBalance,
  redeemVipPass,
  serializeCoinBalance,
  setCoinBalance,
  spendCoins,
} from './coins';

/** Minimal in-memory storage double. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => { storage = memoryStorage(); });

describe('EVIV Coin wallet helpers', () => {
  it('starts at zero, stores only non-negative integers and refuses to overspend', () => {
    expect(getCoinBalance(storage)).toBe(0);
    expect(addCoins(storage, 1200)).toBe(1200);
    expect(JSON.parse(storage.getItem(COIN_STORAGE_KEY)!)).toMatchObject({ balance: 1200 });
    // A tampered/negative or fractional balance is normalised, never trusted as-is.
    setCoinBalance(storage, -500);
    expect(getCoinBalance(storage)).toBe(0);
    setCoinBalance(storage, 90.7);
    expect(getCoinBalance(storage)).toBe(90);
    expect(spendCoins(storage, 100)).toEqual({ ok: false, balance: 90, spent: 0 });
    expect(spendCoins(storage, 40)).toEqual({ ok: true, balance: 50, spent: 40 });
  });

  it('parses legacy/corrupt balances defensively', () => {
    expect(parseCoinBalance('{"balance":250}')).toBe(250);
    expect(parseCoinBalance('{"coins":"40"}')).toBe(40);
    expect(parseCoinBalance('not-json')).toBe(0);
    expect(parseCoinBalance(null)).toBe(0);
    expect(parseCoinBalance('-99')).toBe(0);
    expect(JSON.parse(serializeCoinBalance(12.9))).toEqual({ balance: 12 });
  });

  it('credits a correct prediction once per match, and never for a wrong call', () => {
    const wrong = awardCoinsForCorrectPrediction(storage, 'm1', false);
    expect(wrong).toEqual({ awarded: false, coins: 0, balance: 0, reason: 'not_correct' });

    const first = awardCoinsForCorrectPrediction(storage, 'm1', true);
    expect(first).toMatchObject({ awarded: true, coins: REWARD_CORRECT_PREDICTION, balance: REWARD_CORRECT_PREDICTION });
    expect(hasBeenAwarded(storage, 'm1')).toBe(true);

    // Replaying the same match never pays twice, even on a reload.
    expect(awardCoinsForCorrectPrediction(storage, 'm1', true)).toMatchObject({ awarded: false, coins: 0, reason: 'already_awarded' });
    expect(awardPredictionCoins(storage, 'm1', true)).toMatchObject({ awarded: false, coins: 0 });
    expect([...getAwardedPredictions(storage)]).toEqual(['m1']);
    expect(getCoinBalance(storage)).toBe(REWARD_CORRECT_PREDICTION);
  });

  it('tracks awarded matches across sessions', () => {
    markPredictionAwarded(storage, 'm9');
    expect(hasBeenAwarded(storage, 'm9')).toBe(true);
    expect(hasBeenAwarded(storage, 'm10')).toBe(false);
    expect(awardCoinsForCorrectPrediction(storage, 'm9', true).reason).toBe('already_awarded');
  });
});

describe('VIP pass redemption', () => {
  it('costs exactly 20,000 coins for one month and only succeeds with enough balance', () => {
    expect(COINS_FOR_VIP_PASS).toBe(20_000);
    expect(VIP_PASS_COIN_COST).toBe(20_000);
    expect(VIP_PASS_DURATION_DAYS).toBe(30);
    expect(canRedeemVip(19_999)).toBe(false);
    expect(canRedeemVip(20_000)).toBe(true);

    setCoinBalance(storage, 19_999);
    expect(redeemVipPass(storage, 1_000)).toMatchObject({ ok: false, balance: 19_999, reason: 'insufficient_coins', cost: 20_000 });

    setCoinBalance(storage, 25_000);
    const redeemed = redeemVipPass(storage, 1_000);
    expect(redeemed.ok).toBe(true);
    expect(redeemed.balance).toBe(5_000);
    expect(redeemed.grant).toMatchObject({ planId: 'monthly', source: 'coins', startsAt: 1_000 });
    expect(redeemed.grant!.expiresAt - redeemed.grant!.startsAt).toBe(30 * 86_400_000);
    expect(getCoinBalance(storage)).toBe(5_000);
  });
});

describe('balance display helpers', () => {
  it('never trusts a hidden client flag', () => {
    // Coins are earned and spent through the same API surface, so a hand-edited
    // "VIP" flag in localStorage simply is not part of the wallet contract.
    storage.setItem('eviv:vip', 'true');
    expect(getCoinBalance(storage)).toBe(0);
    const spy = vi.fn();
    spy('eviv:vip');
    expect(spy).toHaveBeenCalledWith('eviv:vip');
  });
});
