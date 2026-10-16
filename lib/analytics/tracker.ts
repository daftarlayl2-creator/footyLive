'use client';

/**
 * First-party analytics beacon for Limon Live.
 *
 * Powers the /mounadel command center: live visitors (heartbeats), ad
 * impressions and click-through rates. Events are batched in-page and flushed
 * with `sendBeacon` (or a keepalive fetch) every few seconds and on pagehide,
 * so it never blocks interaction. A per-tab random session id (sessionStorage
 * only) identifies a visit; nothing personal is collected and no third party
 * is involved.
 */

export type AnalyticsEventType = 'pageview' | 'heartbeat' | 'impression' | 'click';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  /** Ad slot or surface id (impressions/clicks). */
  slot?: string;
  /** Creative id inside a rotating slot. */
  creative?: string;
  /** Page path, e.g. `/watch/123`. */
  path?: string;
}

const SID_KEY = 'limon:sid:v1';
const FLUSH_INTERVAL_MS = 10_000;
const HEARTBEAT_MS = 25_000;
const MAX_QUEUE = 60;

let queue: AnalyticsEvent[] = [];
let started = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** Random per-tab visit id (memory + sessionStorage only). */
export function analyticsSid(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const stored = window.sessionStorage.getItem(SID_KEY);
    if (stored && /^[a-z0-9-]{16,40}$/.test(stored)) return stored;
    const id = (globalThis.crypto?.randomUUID?.() || `sid${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`)
      .replace(/[^a-z0-9-]/gi, '')
      .toLowerCase()
      .slice(0, 40);
    window.sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    return 'nostore';
  }
}

function currentPath(): string {
  try {
    return window.location.pathname.slice(0, 120);
  } catch {
    return '/';
  }
}

/** Normalise + queue an event; oversized queues are flushed immediately. */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  if (!event || (event.type !== 'pageview' && event.type !== 'heartbeat' && event.type !== 'impression' && event.type !== 'click')) return;
  queue.push({
    type: event.type,
    ...(event.slot ? { slot: String(event.slot).slice(0, 48) } : {}),
    ...(event.creative ? { creative: String(event.creative).slice(0, 64) } : {}),
    path: (event.path || currentPath()).slice(0, 120),
  });
  if (queue.length >= MAX_QUEUE) flushEvents();
}

export const trackPageview = (path?: string) => trackEvent({ type: 'pageview', path });
export const trackImpression = (slot: string, creative?: string) => trackEvent({ type: 'impression', slot, creative });
export const trackClick = (slot: string, creative?: string) => trackEvent({ type: 'click', slot, creative });

/** Best-effort, non-blocking delivery. Falls back silently when offline. */
export function flushEvents(): void {
  if (typeof window === 'undefined' || queue.length === 0) return;
  const events = queue;
  queue = [];
  const payload = JSON.stringify({ sid: analyticsSid(), at: Date.now(), events });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon('/api/analytics', blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    /* offline — events are dropped, never queued for personal data */
  }
}

/**
 * Start heartbeats (live-visitor tracking) + periodic flushes. Safe to call
 * once; repeated calls are no-ops. Returns a stop function for tests/unmount.
 */
export function startAnalytics(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  // Immediate heartbeat so a visitor shows up as "live" without waiting 25s.
  trackEvent({ type: 'heartbeat' });
  heartbeatTimer = setInterval(() => {
    if (!document.hidden) trackEvent({ type: 'heartbeat' });
  }, HEARTBEAT_MS);
  flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  const onHide = () => flushEvents();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => {
    started = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (flushTimer) clearInterval(flushTimer);
    heartbeatTimer = null;
    flushTimer = null;
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}
