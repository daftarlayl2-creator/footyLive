/**
 * Daily Lemon Wheel — server-authoritative spin engine.
 *
 * The wheel UI only ever *requests* a spin: the draw happens here, with a
 * crypto RNG, inside the same per-viewer wallet lock the coin economy uses.
 * The 24-hour cooldown lives in this store — one spin per viewer per day, no
 * matter how many tabs are open or what the client claims. Winnings are
 * applied through the real pipelines:
 *
 *   coins → the server wallet (`saveWallet`) + the finance ledger + a receipt;
 *   24h VIP pass → `setViewerVipTier(..., 'bronze', 1 day)` — the same
 *                  entitlement path the admin desk and Rewards Store use, so
 *                  the pass genuinely unlocks ad-free FHD/4K and Multi-View.
 *
 * Storage goes through the shared cache manager (Upstash Redis when configured,
 * in-process memory otherwise), with an in-process copy so a cache outage can
 * never hand out a second spin.
 */
import crypto from 'node:crypto';
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { loadWallet, saveWallet, withWalletLock } from '@/lib/coins/server';
import { recordLedger } from '@/lib/admin/ledger';
import { setViewerVipTier, ADMIN_TIERS } from '@/lib/admin/vip';
import { deliverMessage } from '@/lib/inbox/server';
import { coinGrantReceipt, vipGrantReceipt } from '@/lib/rewards/receipts';
import {
  SPIN_COOLDOWN_MS,
  canSpin,
  drawSpinPrize,
  findSpinPrize,
  nextSpinAt,
  type SpinPrize,
} from './prizes';

const SPIN_TTL_S = 400 * 24 * 60 * 60;
const MAX_HISTORY = 30;

export interface SpinRecord {
  prizeId: string;
  kind: 'coins' | 'vip';
  coins: number;
  at: number;
}

export interface SpinState {
  /** Epoch ms of the last successful spin (0 = never). */
  lastSpinAt: number;
  /** Newest first. */
  history: SpinRecord[];
  updatedAt: number;
}

export const EMPTY_SPIN_STATE: SpinState = Object.freeze({ lastSpinAt: 0, history: Object.freeze([]) as unknown as SpinRecord[], updatedAt: 0 });

/** Fresh empty state per call — never share the `history` array reference. */
const emptyState = (): SpinState => ({ lastSpinAt: 0, history: [], updatedAt: 0 });

const spinKey = (userId: string) => `limon:spin:v1:${userId}`;
const memory = new Map<string, SpinState>();

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function sanitizeRecord(raw: any): SpinRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const prize = findSpinPrize(raw.prizeId);
  if (!prize) return null;
  const at = Number.isFinite(raw.at) ? Number(raw.at) : 0;
  if (at <= 0) return null;
  return {
    prizeId: prize.id,
    kind: prize.kind,
    coins: prize.kind === 'coins' ? prize.coins : 0,
    at,
  };
}

export function sanitizeSpinState(raw: unknown): SpinState {
  if (!raw || typeof raw !== 'object') return emptyState();
  const value = raw as any;
  const history = (Array.isArray(value.history) ? value.history : [])
    .flatMap((row: any) => {
      const clean = sanitizeRecord(row);
      return clean ? [clean] : [];
    })
    .slice(0, MAX_HISTORY);
  const lastSpinAt = Number.isFinite(value.lastSpinAt) && value.lastSpinAt > 0 ? Number(value.lastSpinAt) : 0;
  return { lastSpinAt, history, updatedAt: Number(value.updatedAt) || 0 };
}

async function readState(userId: string): Promise<SpinState> {
  try {
    const stored = await getCacheManager().get<unknown>(spinKey(userId));
    if (stored) {
      const state = sanitizeSpinState(stored);
      memory.set(userId, state);
      return state;
    }
  } catch (err) {
    logger.warn('Spin state read failed; using the in-process copy', { error: String(err) });
  }
  return memory.get(userId) ?? emptyState();
}

async function writeState(userId: string, state: SpinState): Promise<SpinState> {
  const clean = sanitizeSpinState({ ...state, updatedAt: Date.now() });
  memory.set(userId, clean);
  try {
    await getCacheManager().set(spinKey(userId), clean, SPIN_TTL_S);
  } catch (err) {
    logger.warn('Spin state write failed; kept in process', { error: String(err) });
  }
  return clean;
}

/** Test helper: clears the in-process copy. */
export function resetSpinMemory(): void {
  memory.clear();
}

export interface SpinStatus {
  canSpin: boolean;
  /** Epoch ms when the wheel unlocks again (null while it is already open). */
  nextSpinAt: number | null;
  lastSpinAt: number | null;
  lastPrize: SpinRecord | null;
  history: SpinRecord[];
  cooldownMs: number;
}

export async function spinStatus(userId: string, now = Date.now()): Promise<SpinStatus> {
  const state = await readState(userId);
  const open = canSpin(state.lastSpinAt, now);
  return {
    canSpin: open,
    nextSpinAt: open ? null : nextSpinAt(state.lastSpinAt, now),
    lastSpinAt: state.lastSpinAt || null,
    lastPrize: state.history[0] ?? null,
    history: state.history,
    cooldownMs: SPIN_COOLDOWN_MS,
  };
}

export interface SpinResult {
  ok: boolean;
  error?: string;
  reason?: 'cooldown' | 'unknown-user' | 'banned';
  prize?: SpinPrize;
  record?: SpinRecord;
  status?: SpinStatus;
}

/** CSPRNG roll in [0, 1) for `drawSpinPrize`. */
function secureRandom(): number {
  return crypto.randomInt(0, 1 << 30) / (1 << 30);
}

/**
 * Perform one spin for `userId`. The draw, the cooldown check and the payout
 * all run server-side and at most one spin is granted per 24 hours — repeated
 * calls inside the window are refused with `reason: 'cooldown'`.
 */
export async function performSpin(
  userId: string,
  now = Date.now(),
  random: () => number = secureRandom
): Promise<SpinResult> {
  if (!isId(userId)) return { ok: false, error: 'Sign in to spin the Lemon Wheel.', reason: 'unknown-user' };

  return withWalletLock(userId, async () => {
    const state = await readState(userId);
    if (!canSpin(state.lastSpinAt, now)) {
      return {
        ok: false,
        error: 'The Lemon Wheel recharges for 24 hours between spins.',
        reason: 'cooldown',
        status: await spinStatus(userId, now),
      };
    }

    const prize = drawSpinPrize(random);
    const record: SpinRecord = {
      prizeId: prize.id,
      kind: prize.kind,
      coins: prize.kind === 'coins' ? prize.coins : 0,
      at: now,
    };
    const next: SpinState = {
      lastSpinAt: now,
      history: [record, ...state.history].slice(0, MAX_HISTORY),
      updatedAt: now,
    };

    // Winnings go through the real pipelines — never a client-side counter.
    if (prize.kind === 'coins') {
      const wallet = await loadWallet(userId);
      const saved = await saveWallet(userId, { ...wallet, balance: wallet.balance + prize.coins });
      await recordLedger({
        kind: 'coin-grant',
        userId,
        coins: prize.coins,
        balanceAfter: saved.balance,
        note: `Daily Lemon Wheel — ${prize.label}`,
        at: now,
      }).catch(() => undefined);
      await deliverMessage(userId, {
        ...coinGrantReceipt(prize.coins, saved, `The Daily Lemon Wheel landed on ${prize.label}.`),
        at: now,
      }).catch(() => undefined);
    } else {
      const bronze = ADMIN_TIERS.find((tier) => tier.id === 'bronze');
      const result = await setViewerVipTier(userId, 'bronze', { days: 1, note: 'Daily Lemon Wheel — 24h VIP pass', now });
      if (!result.ok) {
        logger.warn('Spin VIP grant failed', { userId, error: result.error });
        return { ok: false, error: 'The VIP pass could not be granted — spin again later.', reason: 'unknown-user' };
      }
      await deliverMessage(userId, {
        ...vipGrantReceipt(
          { label: bronze?.label ?? 'Bronze · 24 hours', labelAr: bronze?.labelAr },
          (result.active ?? result.record)?.expiresAt ?? now + SPIN_COOLDOWN_MS,
          'The Daily Lemon Wheel landed on the 24-hour VIP pass.'
        ),
        at: now,
      }).catch(() => undefined);
    }

    await writeState(userId, next);
    return { ok: true, prize, record, status: await spinStatus(userId, now) };
  });
}
