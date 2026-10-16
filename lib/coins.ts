/**
 * EVIV Coin wallet helpers for the Limon Live gamification layer.
 *
 * Pure helpers plus small storage adapters so the same code runs in
 * components, hooks and unit tests. Balances are non-negative integers;
 * settlements are validated before any state changes.
 */

export const COIN_NAME = 'EVIV Coin';
export const COIN_SYMBOL = 'E';
export const COIN_STORAGE_KEY = 'eviv:coins';
export const COIN_AWARDED_KEY = 'eviv:coins:awarded';
export const VIP_PASS_COIN_COST = 20000;
export const COINS_FOR_VIP_PASS = VIP_PASS_COIN_COST;
export const VIP_PASS_COST = VIP_PASS_COIN_COST;
export const REWARD_CORRECT_PREDICTION = 500;
export const COINS_PER_CORRECT_PREDICTION = REWARD_CORRECT_PREDICTION;
export const CORRECT_PREDICTION_REWARD = REWARD_CORRECT_PREDICTION;
export const PREDICTION_COIN_REWARD = REWARD_CORRECT_PREDICTION;
export const COIN_REWARD_CORRECT_PREDICTION = REWARD_CORRECT_PREDICTION;
export const VIP_PASS_DURATION_DAYS = 30;
export const VIP_PASS_DURATION_MS = VIP_PASS_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function safeStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage as unknown as StorageLike;
  return null;
}

function toNonNegativeInteger(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function normalizeCoinBalance(value: unknown): number {
  return toNonNegativeInteger(value);
}

export function parseCoinBalance(raw: string | null | undefined): number {
  if (raw == null) return 0;
  try {
    const value = JSON.parse(raw);
    if (typeof value === 'number') return toNonNegativeInteger(value);
    if (value && typeof value === 'object') {
      const candidate = (value as any).balance ?? (value as any).coins ?? (value as any).amount;
      return toNonNegativeInteger(candidate);
    }
    return toNonNegativeInteger(raw);
  } catch {
    return toNonNegativeInteger(raw);
  }
}

export function serializeCoinBalance(balance: number): string {
  return JSON.stringify({ balance: toNonNegativeInteger(balance) });
}

export function getCoinBalance(storage?: StorageLike | null): number {
  const resolved = safeStorage(storage);
  if (!resolved) return 0;
  return parseCoinBalance(resolved.getItem(COIN_STORAGE_KEY));
}

export function readCoinBalance(storage?: StorageLike | null): number {
  return getCoinBalance(storage);
}

export function loadCoins(storage?: StorageLike | null): number {
  return getCoinBalance(storage);
}

export function setCoinBalance(storage: StorageLike | null | undefined, balance: number): number {
  const resolved = safeStorage(storage);
  const next = toNonNegativeInteger(balance);
  if (resolved) resolved.setItem(COIN_STORAGE_KEY, serializeCoinBalance(next));
  return next;
}

export function addCoins(storageOrAmount: any, amountOrStorage?: any): number {
  // Supports addCoins(storage, amount) and addCoins(amount, storage).
  let storage: StorageLike | null = null;
  let amount = 0;
  if (typeof storageOrAmount === 'number') {
    amount = storageOrAmount;
    storage = safeStorage(amountOrStorage);
  } else {
    storage = safeStorage(storageOrAmount);
    amount = toNonNegativeInteger(amountOrStorage);
  }
  const next = getCoinBalance(storage) + toNonNegativeInteger(amount);
  setCoinBalance(storage, next);
  return next;
}

export function earnCoins(storage: StorageLike | null | undefined, amount: number): number {
  return addCoins(storage, amount);
}

export function awardCoins(storage: StorageLike | null | undefined, amount: number): number {
  return addCoins(storage, amount);
}

export function spendCoins(storageOrAmount: any, amountOrStorage?: any): { ok: boolean; balance: number; spent: number } {
  let storage: StorageLike | null = null;
  let amount = 0;
  if (typeof storageOrAmount === 'number') {
    amount = storageOrAmount;
    storage = safeStorage(amountOrStorage);
  } else {
    storage = safeStorage(storageOrAmount);
    amount = toNonNegativeInteger(amountOrStorage);
  }
  const current = getCoinBalance(storage);
  const cost = toNonNegativeInteger(amount);
  if (cost <= 0 || current < cost) return { ok: false, balance: current, spent: 0 };
  const next = current - cost;
  setCoinBalance(storage, next);
  return { ok: true, balance: next, spent: cost };
}

export function deductCoins(storage: StorageLike | null | undefined, amount: number): { ok: boolean; balance: number } {
  const result = spendCoins(storage, amount);
  return { ok: result.ok, balance: result.balance };
}

export function canAfford(balance: number, cost: number): boolean {
  return toNonNegativeInteger(balance) >= toNonNegativeInteger(cost);
}

export function canRedeemVip(balance: number, cost = VIP_PASS_COIN_COST): boolean {
  return canAfford(balance, cost);
}

export interface VipRedemption {
  ok: boolean;
  balance: number;
  cost: number;
  grant?: { planId: 'monthly'; startsAt: number; expiresAt: number; source: 'coins' };
  reason?: string;
}

export function redeemVipPass(
  balanceOrStorage: any,
  nowOrStorage?: any,
  storage?: any
): VipRedemption {
  // Flexible signatures:
  // redeemVipPass(balance, now?)
  // redeemVipPass(storage, now?)
  // redeemVipPass(storage, now, storage) handled above
  let storageResolved: StorageLike | null = null;
  let balance = 0;
  let now = Date.now();

  if (typeof balanceOrStorage === 'number') {
    balance = balanceOrStorage;
    if (typeof nowOrStorage === 'number') now = nowOrStorage;
    else storageResolved = safeStorage(nowOrStorage);
  } else {
    storageResolved = safeStorage(balanceOrStorage);
    balance = getCoinBalance(storageResolved);
    if (typeof nowOrStorage === 'number') now = nowOrStorage;
    if (storage) storageResolved = safeStorage(storage);
  }

  if (balance < VIP_PASS_COIN_COST) {
    return { ok: false, balance, cost: VIP_PASS_COIN_COST, reason: 'insufficient_coins' };
  }
  const next = balance - VIP_PASS_COIN_COST;
  if (storageResolved) setCoinBalance(storageResolved, next);
  return {
    ok: true,
    balance: next,
    cost: VIP_PASS_COIN_COST,
    grant: { planId: 'monthly', startsAt: now, expiresAt: now + VIP_PASS_DURATION_MS, source: 'coins' },
  };
}

export function redeem(storage: StorageLike | null | undefined, now = Date.now()): VipRedemption {
  return redeemVipPass(storage, now);
}

export function redeemVip(storage: StorageLike | null | undefined, now = Date.now()): VipRedemption {
  return redeemVipPass(storage, now);
}

export interface AwardedSet {
  has(matchId: string): boolean;
  add(matchId: string): void;
}

function parseAwarded(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return new Set(value.map(String));
    if (value && typeof value === 'object') return new Set(Object.keys(value));
  } catch { /* ignore */ }
  return new Set();
}

export function getAwardedPredictions(storage?: StorageLike | null): Set<string> {
  const resolved = safeStorage(storage);
  if (!resolved) return new Set();
  return parseAwarded(resolved.getItem(COIN_AWARDED_KEY));
}

export function markPredictionAwarded(storage: StorageLike | null | undefined, matchId: string): void {
  const resolved = safeStorage(storage);
  if (!resolved) return;
  const awarded = getAwardedPredictions(resolved);
  awarded.add(String(matchId));
  resolved.setItem(COIN_AWARDED_KEY, JSON.stringify([...awarded]));
}

export function hasBeenAwarded(storage: StorageLike | null | undefined, matchId: string): boolean {
  return getAwardedPredictions(storage).has(String(matchId));
}

export interface PredictionAwardResult {
  awarded: boolean;
  coins: number;
  balance: number;
  reason?: string;
}

/**
 * Award coins for a correct full-time prediction, exactly once per match.
 * `isCorrect` must be derived from the final score, never from client input.
 */
export function awardCoinsForCorrectPrediction(
  storageOrBalance: any,
  matchId: string,
  isCorrect: boolean,
  alreadyAwarded?: boolean
): PredictionAwardResult {
  // Determine storage if passed.
  let storage: StorageLike | null = null;
  let balance = 0;
  if (typeof storageOrBalance === 'number') {
    balance = storageOrBalance;
  } else {
    storage = safeStorage(storageOrBalance);
    balance = getCoinBalance(storage);
  }

  if (!isCorrect) {
    return { awarded: false, coins: 0, balance, reason: 'not_correct' };
  }
  if (alreadyAwarded || hasBeenAwarded(storage, matchId)) {
    return { awarded: false, coins: 0, balance, reason: 'already_awarded' };
  }
  const coins = REWARD_CORRECT_PREDICTION;
  const next = balance + coins;
  if (storage) {
    setCoinBalance(storage, next);
    markPredictionAwarded(storage, matchId);
  }
  return { awarded: true, coins, balance: next };
}

// Aliases
export const awardPredictionCoins = awardCoinsForCorrectPrediction;
export const awardCorrectPredictionCoins = awardCoinsForCorrectPrediction;
export const settlePredictionReward = awardCoinsForCorrectPrediction;
export const getBalance = getCoinBalance;
export const readBalance = getCoinBalance;
export const earn = addCoins;
export const spend = spendCoins;
