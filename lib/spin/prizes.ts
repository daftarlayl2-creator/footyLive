/**
 * Daily Lemon Wheel — prize table and draw rules.
 *
 * Pure data + pure helpers (no server imports), shared by the wheel UI
 * (`components/spin/LemonWheel.jsx`), the spin API (`app/api/spin/route.ts`)
 * and unit tests. The client animates the wheel; the *draw* always happens on
 * the server with an injected RNG (`drawSpinPrize(random)`), so Inspect Element
 * can never re-roll a prize or shorten the cooldown.
 *
 * Prizes: Limon Coins from 100 to 5,000, or a 24-hour VIP pass.
 */

export type SpinPrizeKind = 'coins' | 'vip';

export interface SpinPrize {
  id: string;
  kind: SpinPrizeKind;
  /** Coins credited (kind: 'coins'); the pass carries no coins. */
  coins: number;
  /** English label shown on the wheel segment and in the result card. */
  label: string;
  labelAr: string;
  /** Relative draw weight (server RNG). */
  weight: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/** One spin per registered fan every 24 hours (enforced on the server). */
export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Segments, in wheel order (clockwise from the pointer). */
export const SPIN_PRIZES: readonly SpinPrize[] = Object.freeze([
  { id: 'coins-500', kind: 'coins', coins: 500, label: '500 Coins', labelAr: '٥٠٠ عملة', weight: 22, rarity: 'common' },
  { id: 'coins-250', kind: 'coins', coins: 250, label: '250 Coins', labelAr: '٢٥٠ عملة', weight: 24, rarity: 'common' },
  { id: 'coins-1000', kind: 'coins', coins: 1000, label: '1,000 Coins', labelAr: '١٠٠٠ عملة', weight: 15, rarity: 'rare' },
  { id: 'coins-100', kind: 'coins', coins: 100, label: '100 Coins', labelAr: '١٠٠ عملة', weight: 24, rarity: 'common' },
  { id: 'vip-24h', kind: 'vip', coins: 0, label: '24h VIP Pass', labelAr: 'بطاقة VIP · ٢٤ ساعة', weight: 5, rarity: 'epic' },
  { id: 'coins-2500', kind: 'coins', coins: 2500, label: '2,500 Coins', labelAr: '٢٥٠٠ عملة', weight: 7, rarity: 'epic' },
  { id: 'coins-5000', kind: 'coins', coins: 5000, label: '5,000 Coins', labelAr: '٥٠٠٠ عملة', weight: 3, rarity: 'legendary' },
  { id: 'coins-750', kind: 'coins', coins: 750, label: '750 Coins', labelAr: '٧٥٠ عملة', weight: 20, rarity: 'common' },
]);

/** Smallest and largest coin prize the wheel can ever pay. */
export const SPIN_MIN_COINS = Math.min(...SPIN_PRIZES.filter((p) => p.kind === 'coins').map((p) => p.coins));
export const SPIN_MAX_COINS = Math.max(...SPIN_PRIZES.filter((p) => p.kind === 'coins').map((p) => p.coins));

/** Is `prize` one of the real wheel segments? */
export function isSpinPrize(value: unknown): value is SpinPrize {
  return Boolean(value && typeof value === 'object' && SPIN_PRIZES.some((p) => p.id === (value as SpinPrize).id));
}

export function findSpinPrize(id: unknown): SpinPrize | null {
  return SPIN_PRIZES.find((prize) => prize.id === id) ?? null;
}

/**
 * Weighted draw. `random()` must return [0, 1) — the server passes a CSPRNG
 * wrapper; tests pass a deterministic stub. Invalid RNG input falls back to
 * the first segment so the function never throws mid-payout.
 */
export function drawSpinPrize(random: () => number): SpinPrize {
  const total = SPIN_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
  const roll = (typeof random === 'function' ? random() : 0) * total;
  let cursor = 0;
  for (const prize of SPIN_PRIZES) {
    cursor += prize.weight;
    if (roll < cursor) return prize;
  }
  return SPIN_PRIZES[SPIN_PRIZES.length - 1];
}

/** Earliest time this fan may spin again (0 when they have never spun). */
export function nextSpinAt(lastSpinAt: number | null | undefined, now = Date.now()): number {
  const last = Number(lastSpinAt);
  if (!Number.isFinite(last) || last <= 0) return 0;
  return last + SPIN_COOLDOWN_MS;
}

/** Server-side gate: one spin per 24 hours. */
export function canSpin(lastSpinAt: number | null | undefined, now = Date.now()): boolean {
  return now >= nextSpinAt(lastSpinAt, now);
}

/** Index of a prize on the wheel (segment order), for the rotation math. */
export function prizeIndex(id: string): number {
  const index = SPIN_PRIZES.findIndex((prize) => prize.id === id);
  return index < 0 ? 0 : index;
}

/**
 * CSS rotation (deg) that lands the wheel with `prizeId` under the pointer.
 * The wheel face is a conic gradient starting at the top; each segment spans
 * `360 / n` degrees clockwise. Extra full turns keep the motion dramatic.
 */
export function targetRotation(prizeId: string, turns = 6, current = 0): number {
  const n = SPIN_PRIZES.length;
  const segment = 360 / n;
  // Centre of the winning segment, measured clockwise from the top.
  const centre = prizeIndex(prizeId) * segment + segment / 2;
  const base = 360 - centre;
  const currentMod = ((current % 360) + 360) % 360;
  return current + turns * 360 + (((base - currentMod) % 360) + 360) % 360;
}
