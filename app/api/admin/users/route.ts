/**
 * GET / POST /api/admin/users — /mounadel user management.
 *
 *  - GET  → the viewer registry (most recently seen first) with balances.
 *  - POST { id, action: 'ban' | 'unban', reason? }       → moderation toggle
 *  - POST { id, action: 'coins', delta, note? }          → wallet adjustment
 *
 * Every mutation is validated here and applied to server-side stores only.
 */
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin/guard';
import { adjustViewerCoins, listAdminUsers, setViewerBanned, viewerBalance } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const MAX_BALANCE_ROWS = 60;

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401, headers });
  }
  const users = await listAdminUsers();
  // Balances for the freshest rows only — the table is long and wallets are per-id reads.
  const withBalance = await Promise.all(
    users.slice(0, MAX_BALANCE_ROWS).map(async (row) => ({ ...row, balance: await viewerBalance(row.id) })),
  );
  return NextResponse.json(
    { users: [...withBalance, ...users.slice(MAX_BALANCE_ROWS).map((row) => ({ ...row, balance: null }))], at: Date.now() },
    { headers },
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
  const id = body?.id;
  const action = body?.action;

  if (action === 'ban' || action === 'unban') {
    const result = await setViewerBanned(id, action === 'ban', body?.reason);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404, headers });
    return NextResponse.json({ ok: true, user: result.user }, { headers });
  }

  if (action === 'coins') {
    const result = await adjustViewerCoins(id, body?.delta, body?.note);
    if (!result.ok) return NextResponse.json({ error: result.error || 'Adjustment failed.' }, { status: 400, headers });
    return NextResponse.json({ ok: true, balance: result.wallet?.balance ?? null }, { headers });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers });
}
