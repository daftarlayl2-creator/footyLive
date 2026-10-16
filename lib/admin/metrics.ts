/**
 * Admin analytics store: live visitors, ad impressions, clicks and CTR.
 *
 * Events arrive from the first-party beacon (/api/analytics). Durable counters
 * live in the shared cache manager (Upstash Redis when configured, in-process
 * memory otherwise); the sub-minute "live right now" heartbeat map is
 * process-local by design — it only answers "who pinged us in the last 90s".
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';

export const LIVE_VISITOR_WINDOW_MS = 90_000;
const STORE_KEY = 'limon:admin:metrics:v2';
const STORE_TTL_S = 400 * 24 * 60 * 60;
const MAX_DAILY_VISITORS = 500;
const MAX_DAYS = 30;
export const ANALYTICS_EVENT_TYPES = ['pageview', 'heartbeat', 'impression', 'click'] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface RawAnalyticsEvent {
  type: unknown;
  slot?: unknown;
  creative?: unknown;
  path?: unknown;
}

/** In-process heartbeat map: sid → last ping (drives "live right now"). */
const heartbeats = new Map<string, number>();

interface DayBucket {
  date: string; // YYYY-MM-DD (UTC)
  pageviews: number;
  impressions: number;
  clicks: number;
  visitors: string[];
}

export interface MetricsStore {
  totals: { pageviews: number; impressions: number; clicks: number };
  bySlot: Record<string, { impressions: number; clicks: number }>;
  days: DayBucket[];
  updatedAt: number;
}

const EMPTY_STORE: MetricsStore = {
  totals: { pageviews: 0, impressions: 0, clicks: 0 },
  bySlot: {},
  days: [],
  updatedAt: 0,
};

const memoryFallback: { store: MetricsStore | null } = { store: null };

const cleanText = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').trim() : '').slice(0, max);

const validSid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{4,64}$/.test(value);

const utcDay = (at: number): string => new Date(at).toISOString().slice(0, 10);

function sanitizeStore(raw: unknown): MetricsStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STORE, totals: { ...EMPTY_STORE.totals } };
  const value = raw as Partial<MetricsStore>;
  const totals = value.totals && typeof value.totals === 'object' ? value.totals : ({} as any);
  const bySlot: MetricsStore['bySlot'] = {};
  for (const [slot, row] of Object.entries(value.bySlot || {})) {
    if (!row || typeof row !== 'object') continue;
    const key = cleanText(slot, 48);
    if (!key) continue;
    bySlot[key] = {
      impressions: Math.max(0, Math.floor(Number((row as any).impressions) || 0)),
      clicks: Math.max(0, Math.floor(Number((row as any).clicks) || 0)),
    };
  }
  const days = (Array.isArray(value.days) ? value.days : []).flatMap((day: any) => {
    if (!day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return [];
    return [{
      date: day.date,
      pageviews: Math.max(0, Math.floor(Number(day.pageviews) || 0)),
      impressions: Math.max(0, Math.floor(Number(day.impressions) || 0)),
      clicks: Math.max(0, Math.floor(Number(day.clicks) || 0)),
      visitors: (Array.isArray(day.visitors) ? day.visitors : []).filter(validSid).slice(0, MAX_DAILY_VISITORS),
    }];
  }).slice(-MAX_DAYS);
  return {
    totals: {
      pageviews: Math.max(0, Math.floor(Number(totals.pageviews) || 0)),
      impressions: Math.max(0, Math.floor(Number(totals.impressions) || 0)),
      clicks: Math.max(0, Math.floor(Number(totals.clicks) || 0)),
    },
    bySlot,
    days,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
}

async function loadStore(): Promise<MetricsStore> {
  try {
    const stored = await getCacheManager().get<unknown>(STORE_KEY);
    if (stored) {
      const store = sanitizeStore(stored);
      memoryFallback.store = store;
      return store;
    }
  } catch (err) {
    logger.warn('Admin metrics read failed; using the in-process copy', { error: String(err) });
  }
  return memoryFallback.store ?? sanitizeStore(null);
}

async function saveStore(store: MetricsStore): Promise<void> {
  const next = { ...store, updatedAt: Date.now() };
  memoryFallback.store = next;
  try {
    await getCacheManager().set(STORE_KEY, next, STORE_TTL_S);
  } catch (err) {
    logger.warn('Admin metrics write failed; kept in process', { error: String(err) });
  }
}

/** Note a heartbeat/pageview from a visit (live visitor + daily uniques). */
export function touchHeartbeat(sid: string, now = Date.now()): void {
  if (!validSid(sid)) return;
  heartbeats.set(sid, now);
  // Opportunistic cleanup so the map stays bounded on busy deployments.
  if (heartbeats.size > 10_000) {
    for (const [key, at] of heartbeats) {
      if (now - at > LIVE_VISITOR_WINDOW_MS * 4) heartbeats.delete(key);
    }
  }
}

/** Distinct visits with a heartbeat inside the live window. */
export function liveVisitorCount(now = Date.now()): number {
  let count = 0;
  for (const [sid, at] of heartbeats) {
    if (now - at <= LIVE_VISITOR_WINDOW_MS) count += 1;
    else heartbeats.delete(sid);
  }
  return count;
}

/**
 * Record a validated batch of beacon events. Invalid rows are dropped, not
 * trusted; returns how many events were accepted.
 */
export async function recordAnalyticsEvents(
  sid: unknown,
  events: ReadonlyArray<RawAnalyticsEvent>,
  now = Date.now(),
): Promise<number> {
  if (!validSid(sid) || !Array.isArray(events)) return 0;
  const store = await loadStore();
  const day = utcDay(now);
  let bucket = store.days.find((row) => row.date === day);
  if (!bucket) {
    bucket = { date: day, pageviews: 0, impressions: 0, clicks: 0, visitors: [] };
    store.days.push(bucket);
    store.days = store.days.slice(-MAX_DAYS);
  }
  if (!bucket.visitors.includes(sid) && bucket.visitors.length < MAX_DAILY_VISITORS) bucket.visitors.push(sid);

  let accepted = 0;
  for (const event of events.slice(0, 20)) {
    const type = event?.type;
    if (!ANALYTICS_EVENT_TYPES.includes(type as AnalyticsEventType)) continue;
    accepted += 1;
    if (type === 'heartbeat') {
      touchHeartbeat(sid, now);
      continue;
    }
    if (type === 'pageview') {
      store.totals.pageviews += 1;
      bucket.pageviews += 1;
      continue;
    }
    const slot = cleanText((event as RawAnalyticsEvent).slot, 48) || 'unknown';
    const row = (store.bySlot[slot] ??= { impressions: 0, clicks: 0 });
    if (type === 'impression') {
      row.impressions += 1;
      store.totals.impressions += 1;
      bucket.impressions += 1;
    } else {
      row.clicks += 1;
      store.totals.clicks += 1;
      bucket.clicks += 1;
    }
  }
  if (accepted > 0) await saveStore(store);
  return accepted;
}

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 10_000) / 100 : 0);

export interface MetricsSnapshot {
  liveVisitors: number;
  today: { pageviews: number; impressions: number; clicks: number; ctr: number; visitors: number };
  totals: { pageviews: number; impressions: number; clicks: number; ctr: number };
  last14Days: Array<{ date: string; pageviews: number; impressions: number; clicks: number; visitors: number; ctr: number }>;
  slots: Array<{ slot: string; impressions: number; clicks: number; ctr: number }>;
  updatedAt: number;
}

/** Full dashboard snapshot for /mounadel. */
export async function metricsSnapshot(now = Date.now()): Promise<MetricsSnapshot> {
  const store = await loadStore();
  const todayRow = store.days.find((row) => row.date === utcDay(now));
  const last14 = store.days.slice(-14).map((row) => ({
    date: row.date,
    pageviews: row.pageviews,
    impressions: row.impressions,
    clicks: row.clicks,
    visitors: row.visitors.length,
    ctr: pct(row.clicks, row.impressions),
  }));
  return {
    liveVisitors: liveVisitorCount(now),
    today: {
      pageviews: todayRow?.pageviews ?? 0,
      impressions: todayRow?.impressions ?? 0,
      clicks: todayRow?.clicks ?? 0,
      ctr: pct(todayRow?.clicks ?? 0, todayRow?.impressions ?? 0),
      visitors: todayRow?.visitors.length ?? 0,
    },
    totals: {
      pageviews: store.totals.pageviews,
      impressions: store.totals.impressions,
      clicks: store.totals.clicks,
      ctr: pct(store.totals.clicks, store.totals.impressions),
    },
    last14Days: last14,
    slots: Object.entries(store.bySlot)
      .map(([slot, row]) => ({ slot, impressions: row.impressions, clicks: row.clicks, ctr: pct(row.clicks, row.impressions) }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12),
    updatedAt: store.updatedAt,
  };
}

/** Test helper: clear process-local metrics state. */
export function resetMetricsMemory(): void {
  heartbeats.clear();
  memoryFallback.store = null;
}
