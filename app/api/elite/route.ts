/**
 * GET /api/elite — the `LimonElite` stealth review account.
 *
 * Unlisted (no link in the nav, `noindex`), and its data lives in the same
 * server stores a fan's wallet does. Reading it seeds the account on first call
 * and returns a snapshot: the 9,000,000,000-coin wallet, the Diamond tier, the
 * three winning predictions, the 91% career accuracy and the inbox that proves
 * all three sender identities.
 *
 * There is no client path that raises a balance here: seeding always goes
 * through the admin wallet writers, and this route never accepts a balance.
 */
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin/guard';
import {
  LIMON_ELITE_ACCURACY,
  LIMON_ELITE_COINS,
  LIMON_ELITE_HANDLE,
  LIMON_ELITE_ID,
  ensureLimonEliteSeed,
  limonEliteSnapshot,
} from '@/lib/seed/limonElite';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET() {
  const snapshot = await limonEliteSnapshot();
  return NextResponse.json(snapshot, { headers });
}

/** Health/preview probe: what the seed guarantees, without a full read. */
export async function HEAD() {
  await ensureLimonEliteSeed();
  return new NextResponse(null, {
    status: 200,
    headers: { ...headers, 'X-Limon-Elite': LIMON_ELITE_HANDLE, 'X-Limon-Elite-Coins': String(LIMON_ELITE_COINS), 'X-Limon-Elite-Accuracy': String(LIMON_ELITE_ACCURACY) },
  });
}

/** Admin-only: re-verify (and re-apply) the seed after manual dashboard edits. */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required.' }, { status: 401, headers });
  }
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body?.action !== 'reseed') {
    return NextResponse.json({ error: 'Unknown elite action. Try { action: "reseed" }.' }, { status: 400, headers });
  }
  const marker = await ensureLimonEliteSeed();
  return NextResponse.json({ ok: true, userId: LIMON_ELITE_ID, marker }, { headers });
}
