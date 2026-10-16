/**
 * GET/POST /api/inbox — the fan message centre behind `/inbox` and the header tray.
 *
 *  - GET  → this viewer's messages, newest first, with unread counts per sender.
 *  - POST { action: 'read', ids: [...] }     → mark read (delivery receipts)
 *  - POST { action: 'read-all' }             → clear the badge
 *  - POST { action: 'archive' | 'restore', id }
 *  - POST { action: 'remove', id }
 *  - POST { action: 'support', subject, body } → opens a ticket; the Support Team
 *        replies with a fast-response message in the same thread.
 *
 * Identity is the signed wallet-viewer cookie, so only this browser (or the
 * platform itself) can read or change this inbox. There is no way to address
 * another fan's inbox from the client.
 */
import { NextResponse } from 'next/server';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import { archiveMessage, deliverMessage, ensureWelcomeMessage, markAllRead, markRead, readInbox, removeMessage } from '@/lib/inbox/server';
import { referenceFor, INBOX_SENDER_IDS } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

/**
 * Set once the welcome note has been filed for this viewer. Because it lives in
 * the *browser* (400-day cookie, same lifetime as the viewer identity), a cold
 * cache or a restarted server can never re-deliver the welcome note as "unread"
 * — the exact loop that made the unread badge reappear on every refresh.
 */
export const WELCOME_COOKIE = 'limon_inbox_welcome';

function welcomeCookieFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const entry of header.split(';')) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(`${WELCOME_COOKIE}=`)) return trimmed.slice(WELCOME_COOKIE.length + 1) || null;
  }
  return null;
}

function viewerFor(request: Request) {
  const existing = verifyWalletViewer(walletCookieFromHeader(request.headers.get('cookie')));
  if (existing) return { id: existing, fresh: undefined as string | undefined };
  const created = createWalletViewer();
  return { id: created.id, fresh: created.cookie as string | undefined };
}

function withFreshCookie(response: NextResponse, cookie?: string) {
  if (cookie) response.cookies.set(WALLET_COOKIE, cookie, walletCookieOptions());
  return response;
}

export async function GET(request: Request) {
  const viewer = viewerFor(request);
  // First visit? The Support Team opens the thread, so the tray is never empty.
  // Skipped when this browser already filed it (value pins the viewer id, so a
  // *new* viewer on a shared browser still gets their own welcome note).
  const welcomed = welcomeCookieFromHeader(request.headers.get('cookie')) === viewer.id;
  if (!welcomed) await ensureWelcomeMessage(viewer.id).catch(() => undefined);
  const view = await readInbox(viewer.id);
  const response = withFreshCookie(NextResponse.json({ ...view, userId: viewer.id, senders: INBOX_SENDER_IDS, at: Date.now() }, { headers }), viewer.fresh);
  if (!welcomed) response.cookies.set(WELCOME_COOKIE, viewer.id, walletCookieOptions());
  return response;
}

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim() : '').slice(0, max);

export async function POST(request: Request) {
  const viewer = viewerFor(request);
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }
  const action = typeof body?.action === 'string' ? body.action : '';
  const now = Date.now();

  const respond = async (extra: Record<string, unknown> = {}) => {
    const view = await readInbox(viewer.id);
    return withFreshCookie(NextResponse.json({ ...view, ...extra, at: now }, { headers }), viewer.fresh);
  };

  if (action === 'read') {
    const ids = (Array.isArray(body?.ids) ? body.ids : []).filter((id: unknown) => typeof id === 'string').slice(0, 50);
    const result = await markRead(viewer.id, ids, now);
    return respond({ result });
  }

  if (action === 'read-all') {
    const result = await markAllRead(viewer.id, now);
    return respond({ result });
  }

  if (action === 'archive' || action === 'restore') {
    const id = clean(body?.id, 80);
    const result = await archiveMessage(viewer.id, id, action === 'archive', now);
    return respond({ result });
  }

  if (action === 'remove') {
    const id = clean(body?.id, 80);
    const result = await removeMessage(viewer.id, id, now);
    return respond({ result });
  }

  if (action === 'support') {
    const subject = clean(body?.subject, 140) || 'Help request from the inbox';
    const message = clean(body?.body, 900);
    if (message.length < 10) {
      return NextResponse.json({ error: 'Tell us a little more (at least 10 characters).' }, { status: 400, headers });
    }
    const ticketRef = referenceFor('TCK', `${viewer.id}-${subject}-${now}`);
    // The fan's own note is stored as a support-thread opener with the SLA on it.
    await deliverMessage(
      viewer.id,
      {
        from: 'support',
        kind: 'ticket',
        subject: `Ticket ${ticketRef} received`,
        subjectAr: `تم استلام الطلب ${ticketRef}`,
        body: `We have your message: “${message}”. A human from the support desk is picking this up now — you will get an answer in this thread, and nothing about your coins or your VIP pass changes while we look.`,
        bodyAr: `وصلنا ردك: «${message}». سيتولى أحد زملائي مراجعة الطلب والرد هنا، ولن يتغير رصيدك أو اشتراكك أثناء المراجعة.`,
        replyWithinMinutes: 15,
        ticketRef,
      },
      now
    );
    return respond({ ticket: { ref: ticketRef, subject } });
  }

  return NextResponse.json({ error: 'Unknown inbox action.' }, { status: 400, headers });
}
