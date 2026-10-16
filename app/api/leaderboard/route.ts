/**
 * GET /api/leaderboard — the live global predictor table.
 *
 * Top "Who will win?" predictors ranked by accuracy, correct calls and win
 * streaks, with their active badges. Rows come from settled predictions only
 * (recorded server-side when a vote is settled against the real final score),
 * so the table cannot be shaped by client input. `?limit=` caps the table.
 */
import { NextResponse } from 'next/server';
import { loadLeaderboard, leaderboardRow } from '@/lib/leaderboard/server';
import { verifyWalletViewer, walletCookieFromHeader } from '@/lib/coins/session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const DEFAULT_LIMIT = 25;

export async function GET(request: Request) {
  const limitRaw = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : DEFAULT_LIMIT;

  const [{ rows, updatedAt }, viewerId] = await Promise.all([
    loadLeaderboard(limit),
    Promise.resolve(verifyWalletViewer(walletCookieFromHeader(request.headers.get('cookie')))),
  ]);

  // The requesting fan's own row (when they have settled at least one call).
  const me = viewerId ? await leaderboardRow(viewerId).catch(() => null) : null;

  return NextResponse.json(
    {
      rows: rows.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        handle: row.handle,
        settled: row.settled,
        correct: row.correct,
        wrong: row.wrong,
        accuracy: row.accuracy,
        streak: row.streak,
        bestStreak: row.bestStreak,
        badges: row.badges,
        seeded: row.seeded,
        lastOutcomeAt: row.lastOutcomeAt,
      })),
      me,
      total: rows.length,
      updatedAt,
      verified: true,
    },
    { headers }
  );
}
