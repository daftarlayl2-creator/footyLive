/**
 * GET/POST /api/wallet
 *
 * The authoritative EVIV Coin wallet for Limon Live.
 *
 *  - GET  → balance, reward history and the redeemed VIP pass window.
 *  - POST { action: 'settle', matchIds: [...] }
 *         → settles finished predictions *on the server*: the final score is
 *           fetched here, the pick is compared here, and coins are credited here
 *           at most once per match. The client only supplies which matches it
 *           played; the server decides everything that pays out.
 *  - POST { action: 'redeem', reward: 'vip-1-month' }
 *         → spends 20,000 coins on a 1-month VIP pass, validated server-side.
 */
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { getMatchDetails } from '@/lib/streamEngine';
import { REWARD_CORRECT_PREDICTION, VIP_PASS_COIN_COST } from '@/lib/coins';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import { creditPredictionReward, loadWallet, redeemVipReward, sanitizeWallet, VIP_REWARD } from '@/lib/coins/server';
import { readVote } from '@/lib/predictions/server';
import { settleVote } from '@/lib/predictions/antiCheat';
import { isPrediction } from '@/lib/predictions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const MAX_SETTLE_PER_REQUEST = 40;

function validMatchId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value);
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

function walletPayload(userId: string, wallet: ReturnType<typeof sanitizeWallet>) {
  const now = Date.now();
  return {
    userId,
    balance: wallet.balance,
    awards: wallet.awards,
    redemptions: wallet.redemptions,
    reward: REWARD_CORRECT_PREDICTION,
    vipReward: VIP_REWARD,
    // Server-clock view of the redeemed VIP window (never a client guess).
    vipActive: wallet.redemptions.some((row) => row.rewardId === VIP_REWARD.id && row.expiresAt > now),
    vipExpiresAt: wallet.redemptions.reduce((max, row) => (row.rewardId === VIP_REWARD.id && row.expiresAt > now ? Math.max(max, row.expiresAt) : max), 0) || null,
    updatedAt: wallet.updatedAt,
  };
}

export async function GET(request: Request) {
  const viewer = viewerFor(request);
  const wallet = await loadWallet(viewer.id);
  return withFreshCookie(NextResponse.json(walletPayload(viewer.id, wallet), { headers }), viewer.fresh);
}

export async function POST(request: Request) {
  const viewer = viewerFor(request);
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }

  const action = body?.action;

  if (action === 'settle') {
    const requested = (Array.isArray(body?.matchIds) ? body.matchIds : []).filter(validMatchId).slice(0, MAX_SETTLE_PER_REQUEST);
    const settled: Array<{ matchId: string; settled: boolean; correct: boolean; coins: number; outcome?: string | null; reason?: string }> = [];
    let credited = 0;

    for (const matchId of requested) {
      // The vote must exist server-side; a client cannot invent a winning pick.
      const vote = await readVote(matchId, viewer.id);
      if (!vote || !isPrediction(vote.prediction)) {
        settled.push({ matchId, settled: false, correct: false, coins: 0, reason: 'no-vote' });
        continue;
      }
      let match = null;
      try {
        match = await getMatchDetails(matchId);
      } catch (err) {
        logger.warn('Wallet settlement: fixture lookup failed', { matchId, error: String(err) });
      }
      const wallet = await loadWallet(viewer.id);
      const settlement = settleVote({
        vote,
        status: match?.status,
        homeScore: match?.homeScore,
        awayScore: match?.awayScore,
        alreadyAwarded: wallet.awards.some((award) => award.matchId === matchId),
        reward: REWARD_CORRECT_PREDICTION,
      });
      if (settlement.coins > 0) {
        const result = await creditPredictionReward(viewer.id, matchId, settlement.coins);
        credited += result.credited;
      }
      settled.push({
        matchId,
        settled: settlement.settled,
        correct: settlement.correct,
        coins: settlement.coins,
        outcome: settlement.outcome,
        reason: settlement.reason,
      });
    }

    const wallet = await loadWallet(viewer.id);
    return withFreshCookie(
      NextResponse.json({ ...walletPayload(viewer.id, wallet), credited, settled, verified: true }, { headers }),
      viewer.fresh
    );
  }

  if (action === 'redeem') {
    const reward = typeof body?.reward === 'string' ? body.reward : 'vip-1-month';
    if (reward !== VIP_REWARD.id) {
      return NextResponse.json({ error: 'Unknown reward.', reason: 'unknown-reward' }, { status: 400, headers });
    }
    const result = await redeemVipReward(viewer.id);
    if (!result.ok) {
      return NextResponse.json(
        {
          ...walletPayload(viewer.id, result.wallet),
          error:
            result.reason === 'insufficient-coins'
              ? `You need ${VIP_PASS_COIN_COST.toLocaleString()} EVIV Coins for this VIP pass.`
              : 'This reward could not be redeemed right now.',
          reason: result.reason,
          cost: VIP_PASS_COIN_COST,
        },
        { status: 409, headers }
      );
    }
    return withFreshCookie(
      NextResponse.json(
        { ...walletPayload(viewer.id, result.wallet), grant: result.grant, redeemed: VIP_REWARD, verified: true },
        { headers }
      ),
      viewer.fresh
    );
  }

  return NextResponse.json({ error: 'Unknown wallet action.' }, { status: 400, headers });
}
