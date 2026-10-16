/**
 * GET/POST /api/reactions/{matchId} — live reaction counters for one match.
 *
 *  - GET  → the shared tallies every viewer of the match sees.
 *  - POST { kind } → count one reaction (Fire, Goal Cheer, Whistle, Lemon
 *    Vibe) from the signed viewer cookie. Per-viewer throttling keeps the
 *    counters honest; the floating bubble animation itself is client-side.
 */
import { NextResponse } from 'next/server';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import {
  REACTION_KINDS,
  REACTION_META,
  emptyReactionCounts,
  loadReactionCounts,
  recordReaction,
} from '@/lib/reactions/server';

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

function metaPayload() {
  return REACTION_KINDS.map((kind) => ({ kind, ...REACTION_META[kind] }));
}

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const counts = await loadReactionCounts(matchId);
  return NextResponse.json({ matchId, counts, kinds: metaPayload() }, { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const viewer = viewerFor(request);

  let kind: unknown = null;
  try {
    const body = await request.json();
    kind = body?.kind;
  } catch {
    return withFreshCookie(NextResponse.json({ error: 'Missing reaction kind.' }, { status: 400, headers }), viewer.fresh);
  }

  const result = await recordReaction(matchId, kind, viewer.id);
  if (!result.ok) {
    return withFreshCookie(
      NextResponse.json({ error: 'Unknown reaction.', counts: result.counts, kinds: metaPayload() }, { status: 400, headers }),
      viewer.fresh
    );
  }
  return withFreshCookie(
    NextResponse.json({ ok: true, counted: result.counted, counts: result.counts, kinds: metaPayload() }, { headers }),
    viewer.fresh
  );
}
