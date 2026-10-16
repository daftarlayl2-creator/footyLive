/**
 * GET/POST /api/spin — the Daily Lemon Wheel.
 *
 *  - GET  → this viewer's wheel status: can they spin, when the cooldown ends
 *           and what the last prizes were.
 *  - POST → spin once. The draw, the 24-hour cooldown and the payout are all
 *           decided here — the client only animates to the prize the server
 *           returned. Coins land in the server wallet, the 24h VIP pass is a
 *           real entitlement, and both file a receipt in the fan's inbox.
 *
 * Identity is the same signed wallet-viewer cookie the predictions, wallet and
 * leaderboard use, so the cooldown cannot be reset with a new tab or a faked
 * body. The wheel is for registered fans: the UI gates on the signed-in
 * account and the request must carry the fan's handle (recorded like a vote).
 */
import { NextResponse } from 'next/server';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import { performSpin, spinStatus } from '@/lib/spin/server';
import { SPIN_MAX_COINS, SPIN_MIN_COINS, SPIN_PRIZES, SPIN_COOLDOWN_MS } from '@/lib/spin/prizes';
import { isViewerBanned, registerViewer } from '@/lib/admin/users';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

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

/** Public wheel catalogue (what the UI draws — never a price or a payout). */
function catalogPayload() {
  return {
    prizes: SPIN_PRIZES.map((prize) => ({
      id: prize.id,
      kind: prize.kind,
      label: prize.label,
      labelAr: prize.labelAr,
      rarity: prize.rarity,
      coins: prize.kind === 'coins' ? prize.coins : null,
    })),
    minCoins: SPIN_MIN_COINS,
    maxCoins: SPIN_MAX_COINS,
    cooldownMs: SPIN_COOLDOWN_MS,
  };
}

export async function GET(request: Request) {
  const viewer = viewerFor(request);
  const status = await spinStatus(viewer.id);
  const response = NextResponse.json({ ...catalogPayload(), ...status, viewerId: viewer.id, verified: true }, { headers });
  return withFreshCookie(response, viewer.fresh);
}

export async function POST(request: Request) {
  const viewer = viewerFor(request);

  let handle = '';
  try {
    const body = await request.json();
    handle = typeof body?.handle === 'string' ? body.handle.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) : '';
  } catch {
    /* body is optional; the cooldown does not depend on it */
  }

  // Admin moderation: banned fans cannot spin.
  if (await isViewerBanned(viewer.id)) {
    return withFreshCookie(
      NextResponse.json({ error: 'This fan account is suspended from rewards.', reason: 'banned' }, { status: 403, headers }),
      viewer.fresh
    );
  }

  // Like a vote, a spin registers the viewer in the operator's user table.
  await registerViewer(viewer.id, { path: '/spin', handle }).catch((err) => {
    logger.warn('Spin viewer registration failed', { error: String(err) });
  });

  const result = await performSpin(viewer.id);
  if (!result.ok) {
    return withFreshCookie(
      NextResponse.json(
        { error: result.error, reason: result.reason, ...catalogPayload(), ...(result.status ?? {}) },
        { status: result.reason === 'cooldown' ? 429 : 400, headers }
      ),
      viewer.fresh
    );
  }

  return withFreshCookie(
    NextResponse.json(
      { ok: true, prize: result.prize, record: result.record, ...catalogPayload(), ...result.status, verified: true },
      { headers }
    ),
    viewer.fresh
  );
}
