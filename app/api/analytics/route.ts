/**
 * POST /api/analytics — first-party analytics beacon.
 *
 * Receives batched events from the in-app tracker (pageviews, heartbeats, ad
 * impressions and clicks), validates each row and stores aggregates for the
 * /mounadel command center. The visit id is a random per-tab value — no
 * personal data, no third parties. When the request carries the signed wallet
 * viewer cookie, the presence is also registered in the admin user table so a
 * ban reaches real voting/coin identities.
 *
 * The endpoint is intentionally quiet: it always answers 204 and never tells a
 * sender whether individual events were accepted.
 */
import { recordAnalyticsEvents, type RawAnalyticsEvent } from '@/lib/admin/metrics';
import { registerViewer } from '@/lib/admin/users';
import { verifyWalletViewer, walletCookieFromHeader } from '@/lib/coins/session';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const MAX_EVENTS_PER_BEACON = 20;

/** Cheap per-visit token bucket: enough for heartbeats + ad traffic only. */
const buckets = new Map<string, { tokens: number; at: number }>();
const RATE_LIMIT_PER_MIN = 90;

function rateLimited(sid: string, now: number): boolean {
  const bucket = buckets.get(sid) ?? { tokens: RATE_LIMIT_PER_MIN, at: now };
  const refill = ((now - bucket.at) / 60_000) * RATE_LIMIT_PER_MIN;
  bucket.tokens = Math.min(RATE_LIMIT_PER_MIN, bucket.tokens + Math.max(0, refill));
  bucket.at = now;
  if (buckets.size > 10_000) {
    for (const [key, row] of buckets) if (now - row.at > 5 * 60_000) buckets.delete(key);
  }
  buckets.set(sid, bucket);
  if (bucket.tokens < 1) return true;
  bucket.tokens -= 1;
  return false;
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204, headers });
  }
  const sid = typeof body?.sid === 'string' ? body.sid.slice(0, 64) : '';
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(sid)) return new Response(null, { status: 204, headers });
  if (rateLimited(sid, Date.now())) return new Response(null, { status: 204, headers });

  const events: RawAnalyticsEvent[] = (Array.isArray(body?.events) ? body.events : [])
    .slice(0, MAX_EVENTS_PER_BEACON)
    .filter((event: any) => event && typeof event === 'object')
    .map((event: any) => ({
      type: event.type,
      slot: event.slot,
      creative: event.creative,
      path: event.path,
    }));

  try {
    const accepted = await recordAnalyticsEvents(sid, events);
    // Heartbeats/pageviews from a verified wallet viewer also update the admin
    // user registry (last seen + pageviews + last path).
    const viewerId = verifyWalletViewer(walletCookieFromHeader(request.headers.get('cookie')));
    if (viewerId && accepted > 0) {
      const firstPath = events.find((event) => typeof event.path === 'string' && event.path)?.path as string | undefined;
      const hasPageview = events.some((event) => event.type === 'pageview');
      // Presence is recorded for banned viewers too — the admin needs to see them.
      await registerViewer(viewerId, { path: firstPath, pageview: hasPageview });
    }
  } catch (err) {
    logger.warn('Analytics beacon dropped', { error: String(err) });
  }
  return new Response(null, { status: 204, headers });
}
