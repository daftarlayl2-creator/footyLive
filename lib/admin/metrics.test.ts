import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// NOTE: under the oxc transform the mock factory can be evaluated more than
// once per module graph, so anchor the store on globalThis to guarantee the
// test and the module under test always share one instance.
vi.mock('@/lib/cache/cacheManager', () => {
  const g = globalThis as { __LIMON_TEST_CACHE_STORE__?: Map<string, unknown> };
  if (!g.__LIMON_TEST_CACHE_STORE__) g.__LIMON_TEST_CACHE_STORE__ = new Map<string, unknown>();
  g.__LIMON_TEST_CACHE_STORE__.clear(); // any re-evaluation starts from a clean slate
  const store = g.__LIMON_TEST_CACHE_STORE__;
  return {
    getCacheManager: () => ({
      get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
      set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
    }),
    __resetStore: () => store.clear(),
  };
});
import * as cacheManagerMock from '@/lib/cache/cacheManager';
const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type MetricsApi = typeof import('./metrics');
let api: MetricsApi;

const NOW = Date.parse('2026-10-16T14:00:00Z');
const hour = 3_600_000;
const day = 24 * hour;

// Every test gets a completely fresh metrics module (no module-level caches,
// no memory fallback) plus a clean store and a deterministic clock.
beforeEach(async () => {
  __resetStore(); // clear via the factory instance (mocks are kept across resetModules)
  vi.resetModules();
  api = await import('./metrics');
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe('recordAnalyticsEvents', () => {
  it('aggregates impressions, clicks and pageviews with CTR math', async () => {
    const accepted = await api.recordAnalyticsEvents('visit-alpha-1', [
      { type: 'pageview', path: '/' },
      { type: 'impression', slot: 'banner-728x90' },
      { type: 'impression', slot: 'banner-728x90' },
      { type: 'impression', slot: 'banner-728x90' },
      { type: 'impression', slot: 'banner-728x90' },
      { type: 'click', slot: 'banner-728x90' },
    ]);
    expect(accepted).toBe(6);

    const snapshot = await api.metricsSnapshot();
    expect(snapshot.totals).toMatchObject({ pageviews: 1, impressions: 4, clicks: 1, ctr: 25 });
    expect(snapshot.today.impressions).toBe(4);
    const slot = snapshot.slots.find((row) => row.slot === 'banner-728x90');
    expect(slot).toMatchObject({ impressions: 4, clicks: 1, ctr: 25 });
  });

  it('keeps daily buckets in chronological order across days', async () => {
    await api.recordAnalyticsEvents('visit-day-old', [{ type: 'impression', slot: 'native-banner' }]);
    vi.setSystemTime(NOW + 2 * day);
    await api.recordAnalyticsEvents('visit-day-new', [{ type: 'impression', slot: 'native-banner' }]);

    const snapshot = await api.metricsSnapshot();
    expect(snapshot.last14Days.map((row) => row.date)).toEqual(['2026-10-16', '2026-10-18']);
    expect(snapshot.last14Days[0].visitors).toBe(1);
    expect(snapshot.last14Days[1].impressions).toBe(1);
    expect(snapshot.today.visitors).toBe(1);
  });

  it('isolates days and visitors per bucket', async () => {
    await api.recordAnalyticsEvents('visit-alpha-2', [{ type: 'pageview', path: '/' }]);
    await api.recordAnalyticsEvents('visit-beta-2', [{ type: 'impression', slot: 'sponsor-plate' }]);
    vi.setSystemTime(NOW + 3 * day);
    await api.recordAnalyticsEvents('visit-gamma-2', [{ type: 'click', slot: 'sponsor-plate' }]);

    const snapshot = await api.metricsSnapshot();
    expect(snapshot.last14Days.map((row) => row.date)).toEqual(['2026-10-16', '2026-10-19']);
    expect(snapshot.last14Days[0]).toMatchObject({ pageviews: 1, impressions: 1, visitors: 2 });
    expect(snapshot.last14Days[1]).toMatchObject({ clicks: 1, visitors: 1 });
  });

  it('rejects unknown event types, bad sids and unbounded batches', async () => {
    expect(await api.recordAnalyticsEvents('bad sid!', [{ type: 'pageview' }])).toBe(0);
    expect(await api.recordAnalyticsEvents('visit-ok-9999', [{ type: 'hack' }, { type: null }, { type: 'pageview' }])).toBe(1);
    const flood = Array.from({ length: 60 }, () => ({ type: 'pageview' }));
    // Only the first 20 events of a batch are processed.
    expect(await api.recordAnalyticsEvents('visit-flood-1', flood as any)).toBe(20);
  });
});

describe('live visitors', () => {
  it('counts distinct visits inside the live window only', () => {
    api.touchHeartbeat('visit-live-1');
    api.touchHeartbeat('visit-live-2');
    api.touchHeartbeat('visit-live-1'); // heartbeat refresh keeps one visit
    vi.setSystemTime(NOW + api.LIVE_VISITOR_WINDOW_MS + 1);
    api.touchHeartbeat('visit-live-3');
    expect(api.liveVisitorCount()).toBe(1);
  });

  it('maps heartbeats recorded through the beacon pipeline', async () => {
    await api.recordAnalyticsEvents('visit-pulse-77', [{ type: 'heartbeat' }]);
    expect(api.liveVisitorCount()).toBe(1);
    const snapshot = await api.metricsSnapshot();
    expect(snapshot.liveVisitors).toBe(1);
  });
});
