/**
 * GET / POST /api/admin/inbox — the messages desk inside /mounadel.
 *
 *  - GET  → recipients the operator can write to (the viewer registry, with the
 *           live unread badge per fan) plus the sender identities on offer.
 *  - POST { action: 'send', to: '<viewer id>' | 'all', from: 'platform'|'admin'|'support', subject, subjectAr?, body, bodyAr?, pinned? }
 *         → delivers a styled message (or a platform-wide broadcast) into the
 *           fans' inboxes. The chosen sender decides the visual identity; the
 *           payload itself is sanitized by the inbox store.
 *  - POST { action: 'read', to: '<viewer id>' } → read one fan's inbox (support
 *           escalation / moderation review). Admin session only.
 */
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin/guard';
import { enrichViewerRow, listAdminUsers } from '@/lib/admin/users';
import { deliverMessage, deliverToMany, readInbox } from '@/lib/inbox/server';
import { INBOX_SENDER_IDS, isSenderId, senderTheme } from '@/lib/inbox';
import { adminBroadcast } from '@/lib/rewards/receipts';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const MAX_RECIPIENTS = 80;

const clean = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim() : '').slice(0, max);

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401, headers });
  }
  const users = await listAdminUsers();
  const recipients = await Promise.all(
    users.slice(0, MAX_RECIPIENTS).map(async (row) => {
      const enrichment = await enrichViewerRow(row.id).catch(() => null);
      return {
        id: row.id,
        handle: row.handle,
        lastSeen: row.lastSeen,
        banned: row.banned,
        vipTier: row.vipTier,
        balance: enrichment?.balance ?? 0,
        unread: enrichment?.unread ?? 0,
      };
    }),
  );
  return NextResponse.json(
    {
      recipients,
      totalUsers: users.length,
      senders: INBOX_SENDER_IDS.map((id) => {
        const theme = senderTheme(id);
        return { id, nameAr: theme.nameAr, nameEn: theme.nameEn, roleAr: theme.roleAr, roleEn: theme.roleEn, handle: theme.handle };
      }),
      at: Date.now(),
    },
    { headers }
  );
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401, headers });
  }
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }
  const action = typeof body?.action === 'string' ? body.action : '';
  const from = isSenderId(body?.from) ? body.from : 'admin';
  const to = clean(body?.to, 80);

  if (action === 'read') {
    if (!to || to === 'all') return NextResponse.json({ error: 'Pick one viewer to inspect.' }, { status: 400, headers });
    const view = await readInbox(to, { includeArchived: true });
    return NextResponse.json({ to, ...view, at: Date.now() }, { headers });
  }

  if (action === 'send') {
    const subject = clean(body?.subject, 140);
    const text = clean(body?.body, 900);
    if (subject.length < 3) return NextResponse.json({ error: 'Give the message a subject (3 characters or more).' }, { status: 400, headers });
    if (text.length < 5) return NextResponse.json({ error: 'Write a little more before sending.' }, { status: 400, headers });
    const draft = {
      ...adminBroadcast(from, subject, text, clean(body?.subjectAr, 140)),
      bodyAr: clean(body?.bodyAr, 900) || undefined,
      pinned: Boolean(body?.pinned),
    };

    if (to === 'all' || to === 'everyone' || !to) {
      const users = await listAdminUsers();
      const ids = users.slice(0, 500).map((row) => row.id);
      const delivered = ids.length ? await deliverToMany(ids, { ...draft, id: `cast-${Date.now().toString(36)}` }) : 0;
      return NextResponse.json({ ok: true, broadcast: true, delivered, at: Date.now() }, { headers });
    }

    const delivered = await deliverMessage(to, draft);
    if (!delivered) return NextResponse.json({ error: 'That viewer id is not in the registry.' }, { status: 404, headers });
    return NextResponse.json({ ok: true, message: delivered, at: Date.now() }, { headers });
  }

  return NextResponse.json({ error: 'Unknown inbox action.' }, { status: 400, headers });
}
