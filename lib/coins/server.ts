/**
 * Server-side EVIV Coin wallet.
 *
 * The wallet is authoritative on the backend: balances, prediction rewards and
 * reward-store redemptions are all computed here from server-verified facts.
 * Nothing the client sends can raise a balance — the client only ever asks for
 * an action, and this module decides the outcome.
 *
 * Storage goes through the shared cache manager (Upstash Redis when configured,
 * in-process memory otherwise) with long TTLs, plus an in-process map so a
 * short-lived Redis outage never invents a balance.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import {
  REWARD_CORRECT_PREDICTION,
  VIP_PASS_COIN_COST,
  VIP_PASS_DURATION_DAYS,
  VIP_PASS_DURATION_MS,
  normalizeCoinBalance,
} from '@/lib/coins';

/** Wallets and award ledgers are kept for a year. */
const WALLET_TTL_S = 365 * 24 * 60 * 60;

export interface CoinAward {
  /** Match id the reward belongs to (one reward per match, ever). */
  matchId: string;
  coins: number;
  at: number;
  reason: 'correct-prediction';
}

export interface CoinRedemption {
  rewardId: string;
  coins: number;
  at: number;
  expiresAt: number;
}

export interface WalletState {
  balance: number;
  awards: CoinAward[];
  redemptions: CoinRedemption[];
  updatedAt: number;
}

export interface VipGrant {
  id: string;
  planId: 'monthly';
  startsAt: number;
  expiresAt: number;
  source: 'eviv-coins';
}

export const EMPTY_WALLET: WalletState = Object.freeze({ balance: 0, awards: [], redemptions: [], updatedAt: 0 }) as WalletState;

const walletKey = (userId: string) => `limon:wallet:v1:${userId}`;
/** In-process copy: the fallback whenever the shared cache is unavailable. */
const memory = new Map<string, WalletState>();

function sanitizeAward(raw: any): CoinAward | null {
  if (!raw || typeof raw !== 'object') return null;
  const matchId = typeof raw.matchId === 'string' ? raw.matchId.slice(0, 120) : '';
  const coins = normalizeCoinBalance(raw.coins);
  if (!matchId || coins <= 0) return null;
  return { matchId, coins, at: Number.isFinite(raw.at) ? Number(raw.at) : 0, reason: 'correct-prediction' };
}

function sanitizeRedemption(raw: any): CoinRedemption | null {
  if (!raw || typeof raw !== 'object') return null;
  const rewardId = typeof raw.rewardId === 'string' ? raw.rewardId.slice(0, 60) : '';
  const coins = normalizeCoinBalance(raw.coins);
  if (!rewardId || coins <= 0) return null;
  return {
    rewardId,
    coins,
    at: Number.isFinite(raw.at) ? Number(raw.at) : 0,
    expiresAt: Number.isFinite(raw.expiresAt) ? Number(raw.expiresAt) : 0,
  };
}

export function sanitizeWallet(raw: unknown): WalletState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WALLET };
  const value = raw as any;
  const awards = (Array.isArray(value.awards) ? value.awards : []).flatMap((award: any) => {
    const clean = sanitizeAward(award);
    return clean ? [clean] : [];
  });
  const redemptions = (Array.isArray(value.redemptions) ? value.redemptions : []).flatMap((row: any) => {
    const clean = sanitizeRedemption(row);
    return clean ? [clean] : [];
  });
  return {
    balance: normalizeCoinBalance(value.balance),
    awards: awards.slice(-500),
    redemptions: redemptions.slice(-100),
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
}

export async function loadWallet(userId: string): Promise<WalletState> {
  if (!userId) return { ...EMPTY_WALLET };
  try {
    const stored = await getCacheManager().get<unknown>(walletKey(userId));
    if (stored) {
      const wallet = sanitizeWallet(stored);
      memory.set(userId, wallet);
      return wallet;
    }
  } catch (err) {
    logger.warn('Coin wallet read failed; using the in-process copy', { userId, error: String(err) });
  }
  return memory.get(userId) ?? { ...EMPTY_WALLET };
}

export async function saveWallet(userId: string, wallet: WalletState): Promise<WalletState> {
  const clean = sanitizeWallet({ ...wallet, updatedAt: Date.now() });
  memory.set(userId, clean);
  try {
    await getCacheManager().set(walletKey(userId), clean, WALLET_TTL_S);
  } catch (err) {
    logger.warn('Coin wallet write failed; kept in process', { userId, error: String(err) });
  }
  return clean;
}

export interface CreditResult {
  wallet: WalletState;
  credited: number;
}

/**
 * Credit a reward exactly once per `matchId`. Callers must pass a match id the
 * server itself verified as a correct, finished prediction.
 */
export async function creditPredictionReward(
  userId: string,
  matchId: string,
  coins = REWARD_CORRECT_PREDICTION,
  now = Date.now()
): Promise<CreditResult> {
  const wallet = await loadWallet(userId);
  if (wallet.awards.some((award) => award.matchId === matchId)) return { wallet, credited: 0 };
  const amount = normalizeCoinBalance(coins);
  if (amount <= 0) return { wallet, credited: 0 };
  const next = await saveWallet(userId, {
    ...wallet,
    balance: wallet.balance + amount,
    awards: [...wallet.awards, { matchId, coins: amount, at: now, reason: 'correct-prediction' }],
  });
  return { wallet: next, credited: amount };
}

/** True when this viewer already redeemed the same reward within its window. */
export function activeRedemption(wallet: WalletState, rewardId: string, now = Date.now()): CoinRedemption | null {
  const rows = wallet.redemptions.filter((row) => row.rewardId === rewardId && row.expiresAt > now);
  return rows.length ? rows[rows.length - 1] : null;
}

export interface RedeemResult {
  ok: boolean;
  wallet: WalletState;
  reason?: 'insufficient-coins' | 'already-active' | 'unknown-reward' | 'missing-viewer';
  grant?: VipGrant;
}

/** Server-side redemption of the 1-month VIP pass for 20,000 EVIV Coins. */
export async function redeemVipReward(userId: string, now = Date.now()): Promise<RedeemResult> {
  if (!userId) return { ok: false, wallet: { ...EMPTY_WALLET }, reason: 'missing-viewer' };
  const wallet = await loadWallet(userId);
  if (wallet.balance < VIP_PASS_COIN_COST) {
    return { ok: false, wallet, reason: 'insufficient-coins' };
  }
  const existing = activeRedemption(wallet, 'vip-1-month', now);
  // Stack onto an active pass instead of burning coins on a parallel grant.
  const startsAt = existing ? existing.expiresAt : now;
  const expiresAt = startsAt + VIP_PASS_DURATION_MS;
  const next = await saveWallet(userId, {
    ...wallet,
    balance: wallet.balance - VIP_PASS_COIN_COST,
    redemptions: [
      ...wallet.redemptions,
      { rewardId: 'vip-1-month', coins: VIP_PASS_COIN_COST, at: now, expiresAt },
    ],
  });
  return {
    ok: true,
    wallet: next,
    grant: { id: `coins-vip-${now}`, planId: 'monthly', startsAt, expiresAt, source: 'eviv-coins' },
  };
}

/** Every VIP grant this viewer's coins have bought (expired ones dropped). */
export function coinGrants(wallet: WalletState, now = Date.now()): VipGrant[] {
  return wallet.redemptions
    .filter((row) => row.rewardId === 'vip-1-month' && row.expiresAt > now)
    .map((row) => ({
      id: `coins-vip-${row.at}`,
      planId: 'monthly' as const,
      startsAt: row.at,
      expiresAt: row.expiresAt,
      source: 'eviv-coins' as const,
    }));
}

/**
 * Coin-bought passes in the shape the subscription layer consumes, so a
 * redeemed VIP pass unlocks the same ad-free FHD/4K + Multi-View access as a
 * paid one. Billing grants are merged separately; this only ever adds.
 */
export async function loadCoinGrants(userId: string | null | undefined, now = Date.now()) {
  if (!userId) return [];
  const wallet = await loadWallet(userId);
  return coinGrants(wallet, now).map((grant) => ({
    id: grant.id,
    planId: grant.planId,
    startsAt: grant.startsAt,
    expiresAt: grant.expiresAt,
  }));
}

export const VIP_REWARD = {
  id: 'vip-1-month',
  coins: VIP_PASS_COIN_COST,
  days: VIP_PASS_DURATION_DAYS,
  label: '1-month free VIP pass',
} as const;

/** Test helper: clears the in-process wallet copy. */
export function resetWalletMemory(): void {
  memory.clear();
}
