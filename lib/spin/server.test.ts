import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { performSpin, resetSpinMemory, spinStatus } from './server';
import { SPIN_COOLDOWN_MS, SPIN_PRIZES, findSpinPrize } from './prizes';
import { loadWallet } from '@/lib/coins/server';
import { viewerVipRecord } from '@/lib/admin/vip';

const USER = 'a3f1c2d4-2222-4333-8444-000000000001';
const NOW = 1_700_000_000_000;

beforeEach(() => {
  store.clear();
  resetSpinMemory();
});

describe('Daily Lemon Wheel server engine', () => {
  it('draws the prize server-side and credits coins to the real wallet', async () => {
    // RNG pinned at 0 → the first segment (500 Coins) with the current table.
    const result = await performSpin(USER, NOW, () => 0);
    expect(result.ok).toBe(true);
    const expected = SPIN_PRIZES[0];
    expect(result.prize?.id).toBe(expected.id);

    if (expected.kind === 'coins') {
      const wallet = await loadWallet(USER);
      expect(wallet.balance).toBe(expected.coins);
    }
    const status = await spinStatus(USER, NOW);
    expect(status.canSpin).toBe(false);
    expect(status.nextSpinAt).toBe(NOW + SPIN_COOLDOWN_MS);
    expect(status.history).toHaveLength(1);
  });

  it('refuses a second spin inside the 24-hour window, whatever the client claims', async () => {
    await performSpin(USER, NOW, () => 0);
    const second = await performSpin(USER, NOW + 60_000, () => 0);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('cooldown');
    // The record did not move.
    const status = await spinStatus(USER, NOW + 60_000);
    expect(status.history).toHaveLength(1);
    // …and the wheel opens again exactly 24h after the first spin.
    const later = await performSpin(USER, NOW + SPIN_COOLDOWN_MS, () => 0);
    expect(later.ok).toBe(true);
    expect((await spinStatus(USER, NOW + SPIN_COOLDOWN_MS)).history).toHaveLength(2);
  });

  it('grants a real 24-hour VIP pass when the wheel lands on it', async () => {
    // Find the roll value that lands on the vip-24h segment.
    const total = SPIN_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let cursor = 0;
    let roll = 0.5;
    for (const prize of SPIN_PRIZES) {
      cursor += prize.weight;
      if (prize.kind === 'vip') {
        roll = (cursor - prize.weight / 2) / total;
        break;
      }
    }
    const result = await performSpin(USER, NOW, () => roll);
    expect(result.ok).toBe(true);
    expect(result.prize?.kind).toBe('vip');

    // The pass is a live entitlement on the admin tier store (24h Bronze).
    const record = await viewerVipRecord(USER, NOW + 1000);
    expect(record).not.toBeNull();
    expect(record!.expiresAt).toBeGreaterThanOrEqual(NOW + 23 * 60 * 60 * 1000);
    expect(record!.expiresAt).toBeLessThanOrEqual(NOW + 25 * 60 * 60 * 1000);
  });

  it('validates the user and reports a readable cooldown error', async () => {
    const bad = await performSpin('', NOW);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('unknown-user');

    await performSpin(USER, NOW, () => 0);
    const status = await spinStatus(USER, NOW + 1000);
    expect(status.canSpin).toBe(false);
    expect(findSpinPrize(status.lastPrize?.prizeId)).not.toBeNull();
  });
});
