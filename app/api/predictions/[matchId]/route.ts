/**
 * GET/POST /api/predictions/{matchId}
 *
 * Server-authoritative "Who will win?" votes for Limon Live.
 *
 *  - GET  → the server tally, this viewer's pick and whether voting is locked.
 *  - POST → casts/changes one vote. The single-vote rule, the kick-off lock and
 *           the match phase all come from server-side checks (see
 *           lib/predictions/antiCheat.ts and /server.ts) — never from the body.
 *
 * The viewer id is a signed cookie this route mints, so a fan cannot forge an
 * identity or vote twice under different local keys.
 */
import { NextResponse } from 'next/server';
import { getMatchDetails } from '@/lib/streamEngine';
import logger from '@/lib/logger';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import { isLocked, normalizePhase, safeUsername, settleVote, validateVote } from '@/lib/predictions/antiCheat';
import { loadMatchVotes, readVote, writeVote } from '@/lib/predictions/server';
import { loadWallet, creditPredictionReward } from '@/lib/coins/server';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

interface Viewer {
  id: string;
  /** Cookie to set when this request minted a new viewer. */
  fresh?: string;
}

function viewerFor(request: Request): Viewer {
  const existing = verifyWalletViewer(walletCookieFromHeader(request.headers.get('cookie')));
  if (existing) return { id: existing };
  const created = createWalletViewer();
  return { id: created.id, fresh: created.cookie };
}

function withFreshCookie(response: NextResponse, cookie?: string) {
  if (cookie) response.cookies.set(WALLET_COOKIE, cookie, walletCookieOptions());
  return response;
}

/** Real fixture facts: kick-off and phase come from the provider, not the client. */
async function fixtureFacts(matchId: string) {
  try {
    const match = await getMatchDetails(matchId);
    return {
      status: match?.status ?? 'unknown',
      kickoff: Number.isFinite(match?.timestamp) ? Number(match?.timestamp) : null,
    };
  } catch (err) {
    logger.warn('Prediction fixture lookup failed', { matchId, error: String(err) });
    return { status: 'unknown', kickoff: null };
  }
}

function tallyResponse(votes: Awaited<ReturnType<typeof loadMatchVotes>>, userId: string) {
  const counts = { home: 0, draw: 0, away: 0 };
  for (const vote of votes) counts[vote.prediction] += 1;
  return {
    counts,
    total: counts.home + counts.draw + counts.away,
    voters: votes.length,
    mine: votes.find((vote) => vote.userId === userId)?.prediction ?? null,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const viewer = viewerFor(request);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(matchId)) {
    return NextResponse.json({ error: 'Invalid match id.' }, { status: 400, headers });
  }
  const [facts, votes] = await Promise.all([fixtureFacts(matchId), loadMatchVotes(matchId)]);
  const locked = isLocked({ kickoff: facts.kickoff, status: facts.status });
  const response = NextResponse.json(
    {
      matchId,
      ...tallyResponse(votes, viewer.id),
      locked,
      status: normalizePhase(facts.status),
      kickoff: facts.kickoff,
      reward: REWARD_CORRECT_PREDICTION,
      verified: true,
    },
    { headers }
  );
  return withFreshCookie(response, viewer.fresh);
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  // The match id is validated before anything is read or written.
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(matchId)) {
    return NextResponse.json({ error: 'Invalid match id.' }, { status: 400, headers });
  }
  const viewer = viewerFor(request);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }

  const [facts, previous] = await Promise.all([fixtureFacts(matchId), readVote(matchId, viewer.id)]);
  const decision = validateVote({
    matchId,
    userId: viewer.id,
    prediction: body?.prediction,
    kickoff: facts.kickoff,
    status: facts.status,
  });

  if (!decision.ok) {
    const votes = await loadMatchVotes(matchId);
    return NextResponse.json(
      {
        error:
          decision.reason === 'locked-kickoff' || decision.reason === 'locked-started'
            ? 'Predictions are locked: this match has already kicked off.'
            : decision.reason === 'locked-finished'
              ? 'Predictions are closed: this match has finished.'
              : decision.reason === 'match-unknown'
                ? 'This fixture is not available for predictions right now.'
                : 'That prediction could not be accepted.',
        reason: decision.reason,
        locked: decision.locked,
        ...tallyResponse(votes, viewer.id),
      },
      { status: 409, headers }
    );
  }

  const vote = await writeVote({
    matchId,
    userId: viewer.id,
    username: safeUsername(body?.username),
    prediction: decision.prediction!,
    createdAt: previous?.createdAt ?? decision.at,
    updatedAt: decision.at,
    changes: previous?.changes ?? 0,
  });

  // A finished-and-correct pick is settled here, on the backend, at most once.
  let credited = 0;
  if (normalizePhase(facts.status) === 'finished') {
    const match = await getMatchDetails(matchId).catch(() => null);
    const wallet = await loadWallet(viewer.id);
    const settlement = settleVote({
      vote,
      status: facts.status,
      homeScore: match?.homeScore,
      awayScore: match?.awayScore,
      alreadyAwarded: wallet.awards.some((award) => award.matchId === matchId),
      reward: REWARD_CORRECT_PREDICTION,
    });
    if (settlement.coins > 0) {
      credited = (await creditPredictionReward(viewer.id, matchId, settlement.coins)).credited;
    }
  }

  const votes = await loadMatchVotes(matchId);
  const response = NextResponse.json(
    {
      matchId,
      ...tallyResponse(votes, viewer.id),
      locked: false,
      status: normalizePhase(facts.status),
      kickoff: facts.kickoff,
      change: Boolean(previous),
      credited,
      reward: REWARD_CORRECT_PREDICTION,
      verified: true,
    },
    { headers }
  );
  return withFreshCookie(response, viewer.fresh);
}
