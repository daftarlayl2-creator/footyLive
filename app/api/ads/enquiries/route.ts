/**
 * GET / POST / PATCH /api/ads/enquiries — the "Advertise With Us" desk.
 *
 *  - POST  (public)  { brand, contact, email, packageId, budget?, message, partner? }
 *          → files an advertiser lead and returns the human reference the fan
 *            quotes in the confirmation ("LL-ADS-7F3K").
 *  - GET   (staff,   'ads.manage') → the full queue, newest first.
 *  - PATCH (staff,   'ads.manage') → move a lead through new → contacted → won/lost.
 *
 * The rate card is public (`AD_PACKAGES`); the queue never is. A honeypot field
 * plus a per-IP throttle keeps bots from flooding the store, and every field is
 * validated and sanitized inside `lib/ads/enquiries.ts`.
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin/guard';
import { AD_PACKAGES, enquirySnapshot, listEnquiries, submitEnquiry, updateEnquiry } from '@/lib/ads/enquiries';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const publicHeaders = { 'Cache-Control': 'no-store' };

/** Simple in-process throttle: 6 submissions per IP per 10 minutes. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function throttled(key: string, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) {
    for (const [ip, times] of hits) if (!times.some((at) => now - at < WINDOW_MS)) hits.delete(ip);
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'anonymous';
  return ip.slice(0, 60);
}

export async function GET(request: Request) {
  const gate = requirePermission(request, 'ads.manage');
  if (!gate.ok) return gate.response;
  const snapshot = await enquirySnapshot();
  return NextResponse.json(
    { leads: await listEnquiries(), counts: snapshot.counts, packages: AD_PACKAGES },
    { headers }
  );
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: publicHeaders });
  }

  // Honeypot: a real browser never fills the hidden "website" field.
  if (typeof body?.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true, enquiry: { reference: 'LL-ADS-0000' } }, { headers: publicHeaders });
  }

  const now = Date.now();
  if (throttled(clientKey(request), now)) {
    return NextResponse.json(
      { error: 'Too many requests — try again in a few minutes.', reason: 'throttled' },
      { status: 429, headers: publicHeaders }
    );
  }

  const result = await submitEnquiry(body ?? {}, now);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, errorAr: result.errorAr, field: result.field }, { status: 400, headers: publicHeaders });
  }
  const { enquiry } = result;
  return NextResponse.json(
    {
      ok: true,
      enquiry: {
        reference: enquiry.reference,
        brand: enquiry.brand,
        packageId: enquiry.packageId,
        status: enquiry.status,
        at: enquiry.at,
      },
      /** What the advertiser is told to expect next. */
      sla: { replyWithinHours: 24, contactEmail: 'ads@limon.live' },
    },
    { status: 201, headers: publicHeaders }
  );
}

export async function PATCH(request: Request) {
  const gate = requirePermission(request, 'ads.manage');
  if (!gate.ok) return gate.response;
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }
  const result = await updateEnquiry(body?.id, body?.status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers });
  return NextResponse.json({ ok: true, enquiry: result.enquiry, counts: (await enquirySnapshot()).counts }, { headers });
}
