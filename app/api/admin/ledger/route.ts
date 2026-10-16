/**
 * GET /api/admin/ledger — the /mounadel finance tab: subscription and EVIV
 * Coin movements with running totals (latest first).
 */
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin/guard';
import { ledgerSnapshot } from '@/lib/admin/ledger';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401, headers });
  }
  return NextResponse.json(await ledgerSnapshot(), { headers });
}
