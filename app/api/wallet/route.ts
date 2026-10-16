/**
 * GET/POST /api/wallet — the authoritative Limon Coin wallet + Rewards Store.
 *
 *  - GET  → balance, award ledger, live grants, the reward catalogue the
 *           server is willing to sell, and the redeemed VIP window.
 *  - POST { action: 'settle', matchIds: [...] }
 *         → settles finished predictions *on the server*: the final score is
 *           fetched here, the pick is compared here, and coins are credited here
 *           at most once per match (times any live prediction boost). The client
 *           only supplies which matches it played; the server decides payouts.
 *  - POST { action: 'redeem', reward: '<id from the catalogue>' }
 *         → deducts the price and grants the perk in one atomic wallet write,
 *           then files the receipt in the fan's inbox.
 *
 * Every reward the store advertises is redeemable here, and every refusal comes
 * with a reason the UI can show. Nothing about a balance, a price or a grant is
 * ever taken from the request body.
 */
import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { getMatchDetails } from '@/lib/streamEngine';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';
import {
  createWalletViewer,
  verifyWalletViewer,
  walletCookieFromHeader,
  walletCookieOptions,
  WALLET_COOKIE,
} from '@/lib/coins/session';
import {
  coinGrants,
  creditPredictionReward,
  loadWallet,
  redeemReward,
  sanitizeWallet,
  VIP_REWARD,
  type WalletState,
} from '@/lib/coins/server';
import { REWARD_LIST, findReward } from '@/lib/rewards/catalog';
import { redemptionReceipt } from '@/lib/rewards/receipts';
import { deliverMessage } from '@/lib/inbox/server';
import { readVote } from '@/lib/predictions/server';
import { settleVote } from '@/lib/predictions/antiCheat';
import { isPrediction } from '@/lib/predictions';
import { isViewerBanned } from '@/lib/admin/users';
import { recordLedger } from '@/lib/admin/ledger';

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

/** A compact, safe projection of a grant for the client (no internal ids leak). */
function grantView(wallet: WalletState, now: number) {
  return wallet.grants
    .filter((grant) => (grant.kind === 'vip' ? grant.expiresAt > now : true))
    .map((grant) => ({
      rewardId: grant.rewardId,
      kind: grant.kind,
      label: grant.label,
      labelAr: grant.titleAr ?? '',
      at: grant.at,
      expiresAt: grant.expiresAt,
      multiplier: grant.multiplier ?? null,
      charges: grant.charges ?? null,
      flair: grant.flair ?? null,
    }))
    .reverse();
}

function walletPayload(userId: string, wallet: ReturnType<typeof sanitizeWallet>) {
  const now = Date.now();
  const active = coinGrants(wallet, now);
  const badges = wallet.grants.filter((grant) => grant.kind === 'badge');
  const boosts = wallet.grants.filter((grant) => grant.kind === 'boost');
  const boostCharges = boosts.reduce((sum, grant) => sum + Math.max(0, grant.charges ?? 0), 0);
  return {
    userId,
    balance: wallet.balance,
    awards: wallet.awards,
    redemptions: wallet.redemptions,
    grants: grantView(wallet, now),
    reward: REWARD_CORRECT_PREDICTION,
    vipReward: VIP_REWARD,
    // Server-clock view of the redeemed VIP window (never a client guess).
    vipActive: active.length > 0,
    vipExpiresAt: active.reduce((max, grant) => Math.max(max, grant.expiresAt), 0) || null,
    // Flair + boost state the chat and the predictor read; both are server-owned.
    flair: badges.length ? badges[badges.length - 1].flair : null,
    flairs: badges.map((grant) => grant.flair ?? grant.rewardId),
    boostCharges,
    boostMultiplier: boosts.length ? Math.max(...boosts.map((grant) => grant.multiplier ?? 1)) : 1,
    // The catalogue the UI must render, straight from the server, so a price or
    // an id can never drift between the store and the redemption engine.
    catalog: REWARD_LIST.map((reward) => ({
      id: reward.id,
      title: reward.title,
      titleAr: reward.titleAr,
      cost: reward.cost,
      kind: reward.kind,
      perk: reward.perk,
      rarity: reward.rarity,
      featured: Boolean(reward.featured),
    })),
    updatedAt: wallet.updatedAt,
  };
}

interface RedeemContext {
  cost: number;
  title: string;
  needed: number;
}

/** Reason → the exact HTTP status and the sentence the fan sees. */
const REDEEM_MESSAGES: Record<string, (context: RedeemContext) => { status: number; error: string }> = {
  'insufficient-coins': ({ cost, needed, title }) => ({
    status: 409,
    error: `You need ${needed.toLocaleString('en-US')} more Limon Coins for ${title} (price ${cost.toLocaleString('en-US')}).`,
  }),
  'badge-owned': () => ({ status: 409, error: 'You already own this badge — flairs are permanent, so there is nothing to buy twice.' }),
  'boost-full': () => ({ status: 409, error: 'Your boost queue is full (6 charges maximum). Spend a boost on a prediction, then come back.' }),
  'missing-viewer': () => ({ status: 403, error: 'Open this page with cookies enabled to use the wallet.' }),
  'already-active': () => ({ status: 409, error: 'This reward is already running on your account.' }),
};

export async function GET(request: Request) {
  const viewer = viewerFor(request);
  const wallet = await loadWallet(viewer.id);
  return withFreshCookie(NextResponse.json(walletPayload(viewer.id, wallet), { headers }), viewer.fresh);
}

export async function POST(request: Request) {
  const viewer = viewerFor(request);
  // Admin moderation: a banned fan cannot settle, earn or spend coins.
  if (await isViewerBanned(viewer.id)) {
    return withFreshCookie(
      NextResponse.json({ error: 'This fan account is suspended. Contact Limon Live support.', reason: 'banned' }, { status: 403, headers }),
      viewer.fresh
    );
  }
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers });
  }

  const action = body?.action;

  if (action === 'settle') {
    const requested = (Array.isArray(body?.matchIds) ? body.matchIds : []).filter(validMatchId).slice(0, MAX_SETTLE_PER_REQUEST);
    const settled: Array<{ matchId: string; settled: boolean; correct: boolean; coins: number; outcome?: string | null; reason?: string; multiplier?: number }> = [];
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
        // Any armed prediction boost multiplies this payout and is consumed by the
        // same write that credits the coins — never two separate steps.
        const result = await creditPredictionReward(viewer.id, matchId, settlement.coins);
        credited += result.credited;
        settled.push({
          matchId,
          settled: settlement.settled,
          correct: settlement.correct,
          coins: result.credited || settlement.coins,
          outcome: settlement.outcome,
          reason: settlement.reason,
          multiplier: result.multiplier,
        });
        continue;
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
    if (credited > 0) {
      const paid = settled.filter((row) => row.coins > 0);
      const boosted = paid.some((row) => (row.multiplier ?? 1) > 1);
      await deliverMessage(viewer.id, {
        from: 'platform',
        kind: 'reward',
        subject: `${credited.toLocaleString('en-US')} Limon Coins credited from ${paid.length} correct prediction${paid.length === 1 ? '' : 's'}`,
        subjectAr: `تمت إضافة ${credited.toLocaleString('ar-MA')} عملة ليمون مقابل ${paid.length} توقع صحيح`,
        body: boosted
          ? 'Your calls matched the real full-time scores and the payout is settled on the server from ESPN’s final result. An active prediction boost was applied to this credit.'
          : 'Your calls matched the real full-time scores. The payout is settled on the server from the official final result — one credit per match, ever.',
        bodyAr: 'توقعاتك طابقت النتائج النهائية الرسمية. تُحتسب الجوائز على الخادم من النتيجة الرسمية، مرة واحدة لكل مباراة.',
        lines: paid.slice(0, 6).map((row) => ({
          label: `Match ${row.matchId}`.slice(0, 40),
          value: `+${row.coins.toLocaleString('en-US')}${(row.multiplier ?? 1) > 1 ? ` (×${row.multiplier})` : ''}`,
        })),
        action: { href: '/profile#rewards', label: 'Spend them in the store' },
      });
    }
    return withFreshCookie(
      NextResponse.json({ ...walletPayload(viewer.id, wallet), credited, settled, verified: true }, { headers }),
      viewer.fresh
    );
  }

  if (action === 'redeem') {
    const requested = typeof body?.reward === 'string' && body.reward.trim() ? body.reward.trim() : VIP_REWARD.id;
    const reward = findReward(requested);
    if (!reward) {
      return NextResponse.json(
        { error: 'That reward is not on the menu.', reason: 'unknown-reward', available: REWARD_LIST.map((row) => row.id) },
        { status: 400, headers }
      );
    }

    const result = await redeemReward(viewer.id, reward.id);
    if (!result.ok) {
      const context: RedeemContext = { cost: reward.cost, title: reward.title, needed: Math.max(0, reward.cost - result.wallet.balance) };
      const failure = REDEEM_MESSAGES[result.reason ?? 'unknown-reward'] ?? (() => ({ status: 409, error: 'This reward could not be redeemed right now.' }));
      const { status, error } = failure(context);
      return withFreshCookie(
        NextResponse.json(
          {
            ...walletPayload(viewer.id, result.wallet),
            error,
            reason: result.reason,
            reward: { id: reward.id, title: reward.title, cost: reward.cost },
            needed: context.needed,
            cost: reward.cost,
          },
          { status, headers }
        ),
        viewer.fresh
      );
    }

    // Finance tracking: every redemption is a coin spend on the ledger.
    await recordLedger({
      kind: 'coin-redeem',
      userId: viewer.id,
      coins: -reward.cost,
      balanceAfter: result.wallet.balance,
      ...(result.grant?.planId ? { planId: result.grant.planId } : {}),
      note: `${reward.title} redeemed with Limon Coins`,
    });
    // Instant receipt in the fan's inbox (the same write path as the deduction).
    const receipt = redemptionReceipt(reward, result.coinGrant, result.wallet);
    const delivered = await deliverMessage(viewer.id, receipt, Date.now());

    return withFreshCookie(
      NextResponse.json(
        {
          ...walletPayload(viewer.id, result.wallet),
          grant: result.grant,
          coinGrant: result.coinGrant ? { id: result.coinGrant.id, kind: result.coinGrant.kind, rewardId: result.coinGrant.rewardId } : null,
          redeemed: { id: reward.id, coins: reward.cost, days: reward.days ?? 0, label: reward.title },
          receipt: delivered ? { id: delivered.id, reference: delivered.reference, subject: delivered.subject } : null,
          verified: true,
        },
        { headers }
      ),
      viewer.fresh
    );
  }

  return NextResponse.json({ error: 'Unknown wallet action.' }, { status: 400, headers });
}
