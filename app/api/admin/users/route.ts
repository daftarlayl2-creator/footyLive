/**
 * GET / POST /api/admin/users — the /mounadel interactive user table.
 *
 *  - GET  → the viewer registry (most recently seen first) enriched with the
 *           live wallet balance, redeemed flairs, armed boosts, unread inbox
 *           messages and the admin-granted VIP window.
 *  - POST { id, action: 'ban' | 'unban', reason? }
 *  - POST { id, action: 'coins', delta, note? }          → clamped ± adjustment
 *  - POST { id, action: 'set-balance', balance, note? }  → exact override
 *  - POST { id, action: 'vip', tier, days?, note? }      → real entitlement
 *  - POST { id, action: 'message', from, subject, body } → styled DM
 *
 * Every mutation is validated here and applied to server-side stores only; each
 * one also files a receipt in the fan's inbox.
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin/guard';
import {
  adjustViewerCoins,
  enrichViewerRow,
  listAdminUsers,
  messageViewer,
  setViewerBalance,
  setViewerBanned,
  setViewerTier,
} from '@/lib/admin/users';
import { ADMIN_TIERS } from '@/lib/admin/vip';
import { isSenderId } from '@/lib/inbox';
import { ensureLimonEliteSeed } from '@/lib/seed/limonElite';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
/** Rows enriched with live wallet/inbox data (the table is long, reads are per-id). */
const MAX_ENRICHED_ROWS = 80;

export async function GET(request: Request) {
  const gate = requirePermission(request, 'users.view');
  if (!gate.ok) return gate.response;
  // The dashboard is where the stealth review account is inspected, so the
  // LimonElite seed is verified here (idempotent, never blocks on failure).
  await ensureLimonEliteSeed().catch(() => undefined);
  const users = await listAdminUsers();
  const enriched = await Promise.all(
    users.slice(0, MAX_ENRICHED_ROWS).map(async (row) => ({ ...row, ...(await enrichViewerRow(row.id)) })),
  );
  const rest = users.slice(MAX_ENRICHED_ROWS).map((row) => ({ ...row, balance: null as number | null }));
  return NextResponse.json(
    { users: [...enriched, ...rest], tiers: ADMIN_TIERS, at: Date.now() },
    { headers },
  );
}

const cleanText = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim() : '').slice(0, max);

export async function POST(request: Request) {
  // Every mutation names the capability it needs; `users.view` is the floor.
  const gate = requirePermission(request, 'users.view');
  if (!gate.ok) return gate.response;
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }
  const id = body?.id;
  const action = body?.action;
  const note = cleanText(body?.note, 140);

  if (action === 'ban' || action === 'unban') {
    const banGate = requirePermission(request, 'users.ban');
    if (!banGate.ok) return banGate.response;
    const result = await setViewerBanned(id, action === 'ban', body?.reason);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404, headers });
    return NextResponse.json({ ok: true, user: result.user }, { headers });
  }

  if (action === 'coins') {
    const coinGate = requirePermission(request, 'users.coins');
    if (!coinGate.ok) return coinGate.response;
    const result = await adjustViewerCoins(id, body?.delta, note);
    if (!result.ok) return NextResponse.json({ error: result.error || 'Adjustment failed.' }, { status: 400, headers });
    return NextResponse.json({ ok: true, balance: result.wallet?.balance ?? null, applied: result.applied ?? 0 }, { headers });
  }

  if (action === 'set-balance') {
    const balanceGate = requirePermission(request, 'users.coins');
    if (!balanceGate.ok) return balanceGate.response;
    const result = await setViewerBalance(id, body?.balance, note);
    if (!result.ok) return NextResponse.json({ error: result.error || 'Could not set that balance.' }, { status: 400, headers });
    return NextResponse.json({ ok: true, balance: result.wallet?.balance ?? null, applied: result.applied ?? 0 }, { headers });
  }

  if (action === 'vip') {
    const vipGate = requirePermission(request, 'users.vip');
    if (!vipGate.ok) return vipGate.response;
    const result = await setViewerTier(id, body?.tier, { days: body?.days, note });
    if (!result.ok) return NextResponse.json({ error: result.error || 'Tier assignment failed.' }, { status: 400, headers });
    return NextResponse.json({ ok: true, tier: result.tier, expiresAt: result.expiresAt }, { headers });
  }

  if (action === 'message') {
    const messageGate = requirePermission(request, 'users.message');
    if (!messageGate.ok) return messageGate.response;
    const from = isSenderId(body?.from) ? body.from : 'admin';
    const subject = cleanText(body?.subject, 140);
    const text = cleanText(body?.body, 900);
    if (subject.length < 3) return NextResponse.json({ error: 'Give the message a subject (3 characters or more).' }, { status: 400, headers });
    if (text.length < 5) return NextResponse.json({ error: 'Write a little more before sending.' }, { status: 400, headers });
    const result = await messageViewer(id, from, { subject, body: text, subjectAr: cleanText(body?.subjectAr, 140), bodyAr: cleanText(body?.bodyAr, 900) });
    if (!result.ok) return NextResponse.json({ error: result.error || 'Message failed.' }, { status: 400, headers });
    return NextResponse.json({ ok: true, id: result.id }, { headers });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers });
}
