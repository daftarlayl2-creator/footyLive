/**
 * /api/community/submissions (Phase 12)
 *
 *  - POST          (public)  file a missing-match / source suggestion.
 *  - POST ?report  (public)  flag an entry for moderators.
 *  - GET           (staff, 'streams.manage') the moderation queue.
 *  - PATCH         (staff, 'streams.manage') approve / reject / remove.
 *
 * Submissions are a moderation queue only: they never create or modify
 * verified matches, scores, or statuses (see lib/community/submissions.ts).
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin/guard';
import { listSubmissions, moderateSubmission, reportSubmission, submitCommunityItem } from '@/lib/community/submissions';

export const dynamic = 'force-dynamic';

const staffHeaders = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const publicHeaders = { 'Cache-Control': 'no-store' };

/** In-process throttle: 5 writes per IP per 10 minutes (mirrors the ads desk). */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
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
  return (forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'anonymous').slice(0, 60);
}

export async function GET(request: Request) {
  const gate = requirePermission(request, 'streams.manage');
  if (!gate.ok) return gate.response;
  const submissions = await listSubmissions();
  const counts = { pending: 0, approved: 0, rejected: 0, removed: 0 };
  for (const item of submissions) counts[item.status] += 1;
  return NextResponse.json({ submissions, counts }, { headers: staffHeaders });
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: publicHeaders });
  }

  // Honeypot: real browsers never fill the hidden field.
  if (typeof body?.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: publicHeaders });
  }

  const now = Date.now();
  if (throttled(clientKey(request), now)) {
    return NextResponse.json({ error: 'Too many requests — try again in a few minutes.', reason: 'throttled' }, { status: 429, headers: publicHeaders });
  }

  if (body?.action === 'report') {
    const flagged = await reportSubmission(body.id, now);
    return NextResponse.json({ ok: flagged }, { status: flagged ? 200 : 404, headers: publicHeaders });
  }

  const result = await submitCommunityItem(body ?? {}, now);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, field: result.field }, { status: 400, headers: publicHeaders });
  }
  return NextResponse.json({ ok: true, id: result.submission.id }, { status: 201, headers: publicHeaders });
}

export async function PATCH(request: Request) {
  const gate = requirePermission(request, 'streams.manage');
  if (!gate.ok) return gate.response;
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: staffHeaders });
  }
  const result = await moderateSubmission(body?.id, body?.status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404, headers: staffHeaders });
  return NextResponse.json({ ok: true, submission: result.submission }, { headers: staffHeaders });
}
