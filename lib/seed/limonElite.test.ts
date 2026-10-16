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
  LIMON_ELITE_ID,
  LIMON_ELITE_HANDLE,
  LIMON_ELITE_COINS,
  LIMON_ELITE_ACCURACY,
  LIMON_ELITE_PREDICTIONS,
  ensureLimonEliteSeed,
  limonEliteSnapshot,
  resetLimonEliteSeed,
} from './limonElite';
import { loadWallet, resetWalletMemory } from '@/lib/coins/server';
import { viewerVipRecord, resetAdminVipMemory } from '@/lib/admin/vip';
import { readVote, resetPredictionMemory } from '@/lib/predictions/server';
import { GET as eliteGet, HEAD as eliteHead } from '@/app/api/elite/route';

const NOW = Date.parse('2026-10-16T15:00:00Z');

beforeEach(async () => {
  store.clear();
  resetWalletMemory();
  resetAdminVipMemory();
  resetPredictionMemory();
  await resetLimonEliteSeed();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

describe('Secret admin spy account: LimonElite', () => {
  it('automatically seeds with exactly 9,000,000,000 Limon Coins', async () => {
    await ensureLimonEliteSeed(NOW);

    const wallet = await loadWallet(LIMON_ELITE_ID);
    expect(wallet.balance).toBe(LIMON_ELITE_COINS);
    expect(wallet.balance).toBe(9_000_000_000);
  });

  it('provisions the top Diamond Tier with active 365-day grant', async () => {
    await ensureLimonEliteSeed(NOW);

    const vip = await viewerVipRecord(LIMON_ELITE_ID, NOW);
    expect(vip).not.toBeNull();
    expect(vip?.tier).toBe('diamond');
    expect(vip?.planId).toBe('annual');
    expect(vip?.expiresAt).toBeGreaterThan(NOW);
  });

  it('pre-populates 3 historical winning predictions showing an elite 91% accuracy rate', async () => {
    await ensureLimonEliteSeed(NOW);

    // Verify 3 winning prediction fixtures
    expect(LIMON_ELITE_PREDICTIONS).toHaveLength(3);
    for (const pred of LIMON_ELITE_PREDICTIONS) {
      expect(pred.outcome).toBe('correct');
      const vote = await readVote(pred.matchId, LIMON_ELITE_ID);
      expect(vote).not.toBeNull();
      expect(vote?.prediction).toBe(pred.prediction);
      expect(vote?.username).toBe(LIMON_ELITE_HANDLE);
    }

    // Verify snapshot statistics
    const snapshot = await limonEliteSnapshot(NOW);
    expect(snapshot.stats.accuracy).toBe(91);
    expect(snapshot.stats.accuracy).toBe(LIMON_ELITE_ACCURACY);
    expect(snapshot.stats.streak).toBe(3);
    expect(snapshot.predictions).toHaveLength(3);
  });

  it('seeding is idempotent and safe to execute repeatedly', async () => {
    const first = await ensureLimonEliteSeed(NOW);
    const second = await ensureLimonEliteSeed(NOW + 1000);

    expect(first.coins).toBe(9_000_000_000);
    expect(second.coins).toBe(9_000_000_000);

    const wallet = await loadWallet(LIMON_ELITE_ID);
    expect(wallet.balance).toBe(9_000_000_000);
  });

  it('serves stealth profile snapshot via /api/elite endpoint', async () => {
    const response = await eliteGet();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.profile.handle).toBe('LimonElite');
    expect(body.wallet.balance).toBe(9_000_000_000);
    expect(body.stats.accuracy).toBe(91);
    expect(body.wallet.vipActive).toBe(true);

    // HEAD probe check
    const headRes = await eliteHead();
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get('X-Limon-Elite')).toBe('LimonElite');
    expect(headRes.headers.get('X-Limon-Elite-Coins')).toBe('9000000000');
    expect(headRes.headers.get('X-Limon-Elite-Accuracy')).toBe('91');
  });
});
