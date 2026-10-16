/**
 * Server-side Limon Coin wallet + the Rewards Store redemption engine.
 *
 * The wallet is authoritative on the backend: balances, prediction rewards and
 * reward-store redemptions are all computed here from server-verified facts.
 * Nothing the client sends can raise a balance — the client only ever asks for
 * an action, and this module decides the outcome.
 *
 * Storage goes through the shared cache manager (Upstash Redis when configured,
 * in-process memory otherwise) with long TTLs, plus an in-process map so a
 * short-lived Redis outage never invents a balance.
 *
 * Transactions: every mutation runs inside `withWalletLock` (one writer per
 * viewer at a time) and re-checks the stored `version` before committing, so a
 * redemption is genuinely all-or-nothing: the coins are deducted and the perk is
 * granted in the same write. Two tabs that click "Redeem" together cannot spend
 * the balance twice or mint two passes from one payment.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import {
  REWARD_CORRECT_PREDICTION,
  VIP_PASS_COIN_COST,
  VIP_PASS_DURATION_MS,
  normalizeCoinBalance,
} from '@/lib/coins';
import {
  MAX_BOOST_CHARGES,
  VIP_REWARDS,
  findReward,
  rewardBoost,
  rewardDurationMs,
  type RewardDefinition,
} from '@/lib/rewards/catalog';
import type { PlanId } from '@/lib/subscription/plans';

/** Wallets, award ledgers and grants are kept for a year. */
const WALLET_TTL_S = 365 * 24 * 60 * 60;

export interface CoinAward {
  /** Match id the reward belongs to (one reward per match, ever). */
  matchId: string;
  coins: number;
  at: number;
  reason: 'correct-prediction';
  /** Payout multiplier the grant came from (1 = no boost was active). */
  multiplier?: number;
}

/**
 * Legacy VIP ledger row. It stays the compatibility view of "a pass I bought
 * with coins" (the header chip and `vipActive` still read it); every new VIP
 * redemption is written here *and* into `grants`, and the two are reconciled by
 * `coinGrants()` so a pass is only ever counted once.
 */
export interface CoinRedemption {
  rewardId: string;
  coins: number;
  at: number;
  expiresAt: number;
}

/** A perk bought in the Rewards Store: a VIP window, a flair or boost charges. */
export interface CoinGrant {
  id: string;
  rewardId: string;
  kind: 'vip' | 'badge' | 'boost';
  planId?: PlanId;
  coins: number;
  at: number;
  /** 0 = never expires (badges). */
  expiresAt: number;
  label: string;
  titleAr?: string;
  /** Flair id for `kind: 'badge'`. */
  flair?: string;
  /** Boost bookkeeping for `kind: 'boost'`. */
  multiplier?: number;
  charges?: number;
}

export interface WalletState {
  balance: number;
  awards: CoinAward[];
  redemptions: CoinRedemption[];
  grants: CoinGrant[];
  /** Monotonic write counter used for optimistic concurrency control. */
  version: number;
  updatedAt: number;
}

export interface VipGrant {
  id: string;
  planId: PlanId;
  startsAt: number;
  expiresAt: number;
  source: 'eviv-coins';
}

export const EMPTY_WALLET: WalletState = Object.freeze({
  balance: 0,
  awards: [],
  redemptions: [],
  grants: [],
  version: 0,
  updatedAt: 0,
}) as WalletState;

const walletKey = (userId: string) => `limon:wallet:v1:${userId}`;
/** In-process copy: the fallback whenever the shared cache is unavailable. */
const memory = new Map<string, WalletState>();

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const time = (value: unknown): number => (Number.isFinite(value) ? Number(value) : 0);

function sanitizeAward(raw: any): CoinAward | null {
  if (!raw || typeof raw !== 'object') return null;
  const matchId = typeof raw.matchId === 'string' ? raw.matchId.slice(0, 120) : '';
  const coins = normalizeCoinBalance(raw.coins);
  if (!matchId || coins <= 0) return null;
  const multiplier = Number.isFinite(raw.multiplier) && raw.multiplier > 1 ? Math.min(6, Math.trunc(raw.multiplier)) : 1;
  return {
    matchId,
    coins,
    at: time(raw.at),
    reason: 'correct-prediction',
    ...(multiplier > 1 ? { multiplier } : {}),
  };
}

function sanitizeRedemption(raw: any): CoinRedemption | null {
  if (!raw || typeof raw !== 'object') return null;
  const rewardId = typeof raw.rewardId === 'string' ? raw.rewardId.slice(0, 60) : '';
  const coins = normalizeCoinBalance(raw.coins);
  if (!rewardId || coins <= 0) return null;
  return { rewardId, coins, at: time(raw.at), expiresAt: time(raw.expiresAt) };
}

/** Grants only ever reference rewards the platform actually sells. */
function sanitizeGrant(raw: any): CoinGrant | null {
  if (!raw || typeof raw !== 'object') return null;
  const reward = findReward(raw.rewardId);
  if (!reward) return null;
  const at = time(raw.at);
  const coins = normalizeCoinBalance(raw.coins);
  const base: CoinGrant = {
    id: isId(raw.id) ? raw.id.slice(0, 80) : `grant-${reward.id}-${at}`,
    rewardId: reward.id,
    kind: reward.kind,
    coins,
    at,
    expiresAt: time(raw.expiresAt),
    label: reward.title,
    titleAr: reward.titleAr,
  };
  if (reward.kind === 'vip') {
    // A grant whose window is missing (or whose plan vanished) is junk.
    if (!reward.planId || base.expiresAt <= 0) return null;
    return { ...base, planId: reward.planId };
  }
  if (reward.kind === 'badge') {
    return { ...base, flair: reward.flair ?? 'supporter', expiresAt: 0 };
  }
  const boost = rewardBoost(reward);
  const charges = Math.min(MAX_BOOST_CHARGES, Math.max(0, Math.trunc(Number(raw.charges) || 0)));
  if (!boost || charges <= 0) return null;
  return { ...base, multiplier: boost.multiplier, charges, expiresAt: 0 };
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
  const grants = (Array.isArray(value.grants) ? value.grants : []).flatMap((row: any) => {
    const clean = sanitizeGrant(row);
    return clean ? [clean] : [];
  });
  return {
    balance: normalizeCoinBalance(value.balance),
    awards: awards.slice(-500),
    redemptions: redemptions.slice(-100),
    grants: grants.slice(-200),
    version: normalizeCoinBalance(value.version),
    updatedAt: time(value.updatedAt),
  };
}

/* -------------------------------------------------------------------------- */
/*  Transactions                                                              */
/* -------------------------------------------------------------------------- */

/** One writer per viewer: redemptions, credits and admin moves serialize here. */
const chains = new Map<string, Promise<void>>();

/**
 * Runs `run` while it holds the exclusive write slot for `userId`. Rejections
 * never poison the queue, and the slot is released even if the body throws.
 */
export async function withWalletLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const key = userId || 'anonymous';
  const previous = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const mine = previous.then(() => gate);
  chains.set(key, mine);
  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    release();
    if (chains.get(key) === mine) chains.delete(key);
  }
}

async function readWallet(userId: string): Promise<{ wallet: WalletState; stored: boolean }> {
  if (!userId) return { wallet: { ...EMPTY_WALLET }, stored: false };
  try {
    const stored = await getCacheManager().get<unknown>(walletKey(userId));
    if (stored) {
      const wallet = sanitizeWallet(stored);
      memory.set(userId, wallet);
      return { wallet, stored: true };
    }
  } catch (err) {
    logger.warn('Coin wallet read failed; using the in-process copy', { userId, error: String(err) });
  }
  return { wallet: memory.get(userId) ?? { ...EMPTY_WALLET }, stored: memory.has(userId) };
}

export async function loadWallet(userId: string): Promise<WalletState> {
  return (await readWallet(userId)).wallet;
}

export interface SaveWalletOptions {
  /** Version the caller read. A mismatch means another writer won the race. */
  expectedVersion?: number;
  /**
   * The record the deltas were computed from. On a version conflict the ledger
   * arrays are replayed onto the winning record and only `balance - base.balance`
   * is re-applied, so a lost race neither clobbers nor double-counts.
   */
  base?: WalletState;
}

export async function saveWallet(userId: string, wallet: WalletState, options: SaveWalletOptions = {}): Promise<WalletState> {
  const { expectedVersion, base } = options;
  const current = await readWallet(userId);
  const conflict = expectedVersion !== undefined && current.wallet.version !== expectedVersion && current.stored;
  const next = conflict ? replayDeltas(current.wallet, wallet, base) : wallet;
  const clean = sanitizeWallet({ ...next, version: current.wallet.version + 1, updatedAt: Date.now() });
  memory.set(userId, clean);
  try {
    await getCacheManager().set(walletKey(userId), clean, WALLET_TTL_S);
  } catch (err) {
    logger.warn('Coin wallet write failed; kept in process', { userId, error: String(err) });
  }
  return clean;
}

/** Re-applies a losing writer's intent on top of the record that actually won. */
function replayDeltas(current: WalletState, attempted: WalletState, base?: WalletState): WalletState {
  const from = base ?? current;
  const balanceDelta = normalizeCoinBalance(attempted.balance) - normalizeCoinBalance(from.balance);
  const awardIds = new Set(current.awards.map((award) => award.matchId));
  const grantIds = new Set(current.grants.map((grant) => grant.id));
  const redemptionKeys = new Set(current.redemptions.map((row) => `${row.rewardId}:${row.at}`));
  return {
    ...current,
    balance: Math.max(0, normalizeCoinBalance(current.balance + balanceDelta)),
    awards: [...current.awards, ...attempted.awards.filter((award) => !awardIds.has(award.matchId))].slice(-500),
    grants: [...current.grants, ...attempted.grants.filter((grant) => !grantIds.has(grant.id))].slice(-200),
    redemptions: [
      ...current.redemptions,
      ...attempted.redemptions.filter((row) => !redemptionKeys.has(`${row.rewardId}:${row.at}`)),
    ].slice(-100),
  };
}

/* -------------------------------------------------------------------------- */
/*  Earning                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreditResult {
  wallet: WalletState;
  credited: number;
  /** Multiplier the payout was scaled by (1 when no boost was live). */
  multiplier: number;
  /** Boost grant id consumed by this payout, when one was. */
  boostId?: string;
}

/**
 * Credit a reward exactly once per `matchId`. Callers must pass a match id the
 * server itself verified as a correct, finished prediction.
 *
 * A live prediction boost is consumed by the same write that credits the coins,
 * so a fan can never bank a payout and keep the multiplier for the next match.
 */
export async function creditPredictionReward(
  userId: string,
  matchId: string,
  coins = REWARD_CORRECT_PREDICTION,
  now = Date.now(),
  options: { applyBoost?: boolean } = {}
): Promise<CreditResult> {
  if (!userId || !matchId) return { wallet: { ...EMPTY_WALLET }, credited: 0, multiplier: 1 };
  const applyBoost = options.applyBoost !== false;
  return withWalletLock(userId, async () => {
    const wallet = await loadWallet(userId);
    if (wallet.awards.some((award) => award.matchId === matchId)) return { wallet, credited: 0, multiplier: 1 };
    const amount = normalizeCoinBalance(coins);
    if (amount <= 0) return { wallet, credited: 0, multiplier: 1 };

    const boost = applyBoost ? bestBoostGrant(wallet) : null;
    const multiplier = boost?.multiplier ?? 1;
    const payout = Math.max(0, Math.floor(amount * multiplier));
    const grants = boost ? consumeBoostGrant(wallet.grants, boost.id, now) : wallet.grants;

    const next = await saveWallet(
      userId,
      {
        ...wallet,
        grants,
        balance: wallet.balance + payout,
        awards: [
          ...wallet.awards,
          { matchId, coins: payout, at: now, reason: 'correct-prediction' as const, ...(multiplier > 1 ? { multiplier } : {}) },
        ],
      },
      { expectedVersion: wallet.version, base: wallet }
    );
    return { wallet: next, credited: payout, multiplier, ...(boost ? { boostId: boost.id } : {}) };
  });
}

/* -------------------------------------------------------------------------- */
/*  Grants: VIP windows, flair, boosts                                        */
/* -------------------------------------------------------------------------- */

/** Every VIP grant this viewer's coins have bought (expired ones dropped). */
export function coinGrants(wallet: WalletState, now = Date.now()): VipGrant[] {
  const rows: VipGrant[] = [];
  const seen = new Set<string>();
  const push = (grant: VipGrant) => {
    if (seen.has(grant.id)) return;
    seen.add(grant.id);
    rows.push(grant);
  };
  for (const row of wallet.redemptions) {
    if (row.expiresAt <= now || !isVipRewardId(row.rewardId)) continue;
    const reward = findReward(row.rewardId);
    push({
      id: `coins-vip-${row.at}`,
      planId: reward?.planId ?? 'monthly',
      startsAt: row.at,
      expiresAt: row.expiresAt,
      source: 'eviv-coins',
    });
  }
  for (const grant of wallet.grants) {
    if (grant.kind !== 'vip' || grant.expiresAt <= now || !grant.planId) continue;
    push({ id: `coins-vip-${grant.at}`, planId: grant.planId, startsAt: grant.at, expiresAt: grant.expiresAt, source: 'eviv-coins' });
  }
  return rows.sort((a, b) => a.startsAt - b.startsAt);
}

export function isVipRewardId(rewardId: unknown): rewardId is string {
  const reward = findReward(rewardId);
  return reward?.kind === 'vip';
}

/** True when this viewer already redeemed the same reward within its window. */
export function activeRedemption(wallet: WalletState, rewardId: string, now = Date.now()): CoinRedemption | null {
  const rows = wallet.redemptions.filter((row) => row.rewardId === rewardId && row.expiresAt > now);
  return rows.length ? rows[rows.length - 1] : null;
}

/** Flair this fan owns from a redeemed badge (null = no cosmetic flair). */
export function activeFlair(wallet: WalletState): string | null {
  for (let index = wallet.grants.length - 1; index >= 0; index -= 1) {
    const grant = wallet.grants[index];
    if (grant.kind === 'badge' && grant.flair) return grant.flair;
  }
  return null;
}

/** Ids of every flair this wallet unlocked (used by the chat + profile chrome). */
export function ownedFlairs(wallet: WalletState): string[] {
  return [...new Set(wallet.grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.flair ?? grant.rewardId))];
}

/** The strongest live boost charge (null when the fan has none). */
export function bestBoostGrant(wallet: WalletState): CoinGrant | null {
  let best: CoinGrant | null = null;
  for (const grant of wallet.grants) {
    if (grant.kind !== 'boost' || !grant.charges || grant.charges <= 0) continue;
    if (!best || (grant.multiplier ?? 1) > (best.multiplier ?? 1)) best = grant;
  }
  return best;
}

/** Total boost charges waiting to be spent. */
export function boostCharges(wallet: WalletState): number {
  return wallet.grants
    .filter((grant) => grant.kind === 'boost')
    .reduce((sum, grant) => sum + Math.max(0, Math.trunc(grant.charges ?? 0)), 0);
}

function consumeBoostGrant(grants: CoinGrant[], id: string, _now: number): CoinGrant[] {
  return grants
    .map((grant) => (grant.id === id ? { ...grant, charges: Math.max(0, (grant.charges ?? 0) - 1) } : grant))
    .filter((grant) => grant.kind !== 'boost' || (grant.charges ?? 0) > 0);
}

/* -------------------------------------------------------------------------- */
/*  Redemption                                                                */
/* -------------------------------------------------------------------------- */

export type RedeemFailure =
  | 'insufficient-coins'
  | 'already-active'
  | 'unknown-reward'
  | 'missing-viewer'
  | 'badge-owned'
  | 'boost-full';

export interface RedeemResult {
  ok: boolean;
  wallet: WalletState;
  reason?: RedeemFailure;
  /** The catalogue row that was redeemed (or refused). */
  reward?: RewardDefinition;
  grant?: VipGrant;
  /** The full grant record written to the wallet. */
  coinGrant?: CoinGrant;
  /** Balance left after the deduction (handy for the receipt UI). */
  remaining?: number;
}

/**
 * Redeem any reward the store sells: the price is checked against the stored
 * balance, the coins are deducted and the perk (VIP window, flair or boost
 * charges) is granted in the same wallet write.
 */
export async function redeemReward(userId: string, rewardId: unknown, now = Date.now()): Promise<RedeemResult> {
  const reward = findReward(rewardId);
  if (!reward) return { ok: false, wallet: await loadWallet(userId || ''), reason: 'unknown-reward' };
  if (!userId) return { ok: false, wallet: { ...EMPTY_WALLET }, reason: 'missing-viewer', reward };

  return withWalletLock(userId, async () => {
    const wallet = await loadWallet(userId);
    if (wallet.balance < reward.cost) return { ok: false, wallet, reason: 'insufficient-coins', reward };

    if (reward.kind === 'badge' && wallet.grants.some((grant) => grant.rewardId === reward.id)) {
      return { ok: false, wallet, reason: 'badge-owned', reward };
    }
    if (reward.kind === 'boost') {
      const boost = rewardBoost(reward);
      const owned = boostCharges(wallet);
      if (!boost || owned + boost.charges > MAX_BOOST_CHARGES) {
        return { ok: false, wallet, reason: 'boost-full', reward };
      }
    }

    const grantId = `grant-${reward.id}-${now}`;
    let nextWallet: WalletState;

    if (reward.kind === 'vip') {
      // Stack onto an active pass instead of burning coins on a parallel grant.
      const existing = activeRedemption(wallet, reward.id, now);
      const startsAt = existing ? existing.expiresAt : now;
      const expiresAt = startsAt + rewardDurationMs(reward);
      const coinGrant: CoinGrant = {
        id: grantId,
        rewardId: reward.id,
        kind: 'vip',
        planId: reward.planId,
        coins: reward.cost,
        at: startsAt,
        expiresAt,
        label: reward.title,
        titleAr: reward.titleAr,
      };
      nextWallet = await saveWallet(
        userId,
        {
          ...wallet,
          balance: wallet.balance - reward.cost,
          grants: [...wallet.grants, coinGrant],
          redemptions: [...wallet.redemptions, { rewardId: reward.id, coins: reward.cost, at: startsAt, expiresAt }],
        },
        { expectedVersion: wallet.version, base: wallet }
      );
      const written = nextWallet.grants[nextWallet.grants.length - 1] ?? coinGrant;
      return {
        ok: true,
        wallet: nextWallet,
        reward,
        grant: { id: `coins-vip-${startsAt}`, planId: reward.planId ?? 'monthly', startsAt, expiresAt, source: 'eviv-coins' },
        coinGrant: written,
        remaining: nextWallet.balance,
      };
    }

    if (reward.kind === 'badge') {
      const coinGrant: CoinGrant = {
        id: grantId,
        rewardId: reward.id,
        kind: 'badge',
        coins: reward.cost,
        at: now,
        expiresAt: 0,
        flair: reward.flair ?? 'supporter',
        label: reward.title,
        titleAr: reward.titleAr,
      };
      nextWallet = await saveWallet(userId, { ...wallet, balance: wallet.balance - reward.cost, grants: [...wallet.grants, coinGrant] }, { expectedVersion: wallet.version, base: wallet });
      return { ok: true, wallet: nextWallet, reward, coinGrant: nextWallet.grants[nextWallet.grants.length - 1] ?? coinGrant, remaining: nextWallet.balance };
    }

    const boost = rewardBoost(reward)!;
    const coinGrant: CoinGrant = {
      id: grantId,
      rewardId: reward.id,
      kind: 'boost',
      coins: reward.cost,
      at: now,
      expiresAt: 0,
      multiplier: boost.multiplier,
      charges: boost.charges,
      label: reward.title,
      titleAr: reward.titleAr,
    };
    nextWallet = await saveWallet(userId, { ...wallet, balance: wallet.balance - reward.cost, grants: [...wallet.grants, coinGrant] }, { expectedVersion: wallet.version, base: wallet });
    return { ok: true, wallet: nextWallet, reward, coinGrant: nextWallet.grants[nextWallet.grants.length - 1] ?? coinGrant, remaining: nextWallet.balance };
  });
}

/**
 * Legacy entry point: spend 20,000 coins on the 1-month VIP pass. Kept so the
 * existing entitlement tests and callers keep working; it is a thin wrapper
 * around the generic engine, so the behaviour (and the bug fixes) are shared.
 */
export async function redeemVipReward(userId: string, now = Date.now()): Promise<RedeemResult> {
  return redeemReward(userId, 'vip-1-month', now);
}

/** The store's headline reward (20,000 coins → 1 month of VIP). */
export const VIP_REWARD = {
  id: 'vip-1-month',
  coins: VIP_PASS_COIN_COST,
  days: VIP_PASS_DURATION_MS / (24 * 60 * 60 * 1000),
  label: '1-month free VIP pass',
} as const;

/** Every VIP window the store can sell, for the payload builders. */
export const SELLABLE_VIP_REWARDS = VIP_REWARDS;

/**
 * Every entitlement this viewer bought with coins, in the shapes the rest of
 * the platform consumes (subscription layer + chat flair + predictor).
 */
export interface WalletPerks {
  grants: Array<{ id: string; planId: PlanId; startsAt: number; expiresAt: number }>;
  flairs: string[];
  boostCharges: number;
  boostMultiplier: number;
}

export async function loadWalletPerks(userId: string | null | undefined, now = Date.now()): Promise<WalletPerks> {
  const grants = await loadCoinGrantRecords(userId, now);
  const wallet = userId ? await loadWallet(userId) : { ...EMPTY_WALLET };
  const best = bestBoostGrant(wallet);
  return {
    grants,
    flairs: ownedFlairs(wallet),
    boostCharges: boostCharges(wallet),
    boostMultiplier: best?.multiplier ?? 1,
  };
}

function toSubscriptionGrants(list: VipGrant[]) {
  return list.map((grant) => ({ id: grant.id, planId: grant.planId, startsAt: grant.startsAt, expiresAt: grant.expiresAt }));
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

async function loadCoinGrantRecords(userId: string | null | undefined, now: number) {
  if (!userId) return [];
  const wallet = await loadWallet(userId);
  return toSubscriptionGrants(coinGrants(wallet, now));
}

/** Test helper: clears the in-process wallet copy. */
export function resetWalletMemory(): void {
  memory.clear();
  chains.clear();
}
