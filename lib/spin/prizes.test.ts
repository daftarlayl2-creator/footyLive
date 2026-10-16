import { describe, expect, it } from 'vitest';
import {
  SPIN_COOLDOWN_MS,
  SPIN_MAX_COINS,
  SPIN_MIN_COINS,
  SPIN_PRIZES,
  canSpin,
  drawSpinPrize,
  findSpinPrize,
  isSpinPrize,
  nextSpinAt,
  prizeIndex,
  targetRotation,
} from './prizes';

/** Deterministic RNG stub: returns the given rolls in order. */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('Daily Lemon Wheel prize table', () => {
  it('pays 100 to 5,000 coins or a 24-hour VIP pass — nothing else', () => {
    expect(SPIN_MIN_COINS).toBe(100);
    expect(SPIN_MAX_COINS).toBe(5000);
    for (const prize of SPIN_PRIZES) {
      if (prize.kind === 'coins') {
        expect(prize.coins).toBeGreaterThanOrEqual(100);
        expect(prize.coins).toBeLessThanOrEqual(5000);
      } else {
        expect(prize.id).toBe('vip-24h');
        expect(prize.coins).toBe(0);
      }
    }
    expect(SPIN_PRIZES.some((p) => p.kind === 'vip')).toBe(true);
  });

  it('draws only real segments and honours the injected RNG', () => {
    const first = drawSpinPrize(rolls(0));
    expect(first.id).toBe(SPIN_PRIZES[0].id);
    const last = drawSpinPrize(rolls(0.9999));
    expect(isSpinPrize(last)).toBe(true);
    // A broken RNG degrades to the first segment instead of throwing.
    expect(drawSpinPrize(undefined as unknown as () => number).id).toBe(SPIN_PRIZES[0].id);
    // Every segment is reachable across the roll space.
    const seen = new Set<string>();
    for (let step = 0; step <= 1000; step += 1) seen.add(drawSpinPrize(rolls(step / 1000)).id);
    expect(seen.size).toBe(SPIN_PRIZES.length);
  });

  it('finds segments by id and validates prize objects', () => {
    expect(findSpinPrize('coins-500')?.coins).toBe(500);
    expect(findSpinPrize('nope')).toBeNull();
    expect(isSpinPrize({ id: 'vip-24h' })).toBe(true);
    expect(isSpinPrize({ id: 'free-vip-forever' })).toBe(false);
    expect(isSpinPrize(null)).toBe(false);
  });

  it('locks the wheel for 24 hours after a spin', () => {
    const now = 1_700_000_000_000;
    // Never spun → open.
    expect(canSpin(0, now)).toBe(true);
    expect(nextSpinAt(0, now)).toBe(0);
    // Just spun → locked exactly 24 hours.
    expect(canSpin(now, now)).toBe(false);
    expect(nextSpinAt(now, now)).toBe(now + SPIN_COOLDOWN_MS);
    expect(canSpin(now, now + SPIN_COOLDOWN_MS - 1)).toBe(false);
    expect(canSpin(now, now + SPIN_COOLDOWN_MS)).toBe(true);
  });

  it('lands the wheel on the centre of the requested segment', () => {
    const n = SPIN_PRIZES.length;
    const segment = 360 / n;
    for (const prize of SPIN_PRIZES) {
      const rotation = targetRotation(prize.id, 5, 0);
      // The full turns are preserved, the landing is deterministic.
      expect(rotation).toBeGreaterThan(5 * 360 - 1);
      // (rotation mod 360) puts the segment centre at the 12 o'clock pointer.
      const landedCentre = prizeIndex(prize.id) * segment + segment / 2;
      const mod = ((rotation % 360) + 360) % 360;
      expect(Math.round((mod + landedCentre) % 360)).toBe(0);
    }
    // Unknown ids land on the first segment instead of NaN.
    expect(Number.isFinite(targetRotation('unknown', 3, 120))).toBe(true);
  });
});
