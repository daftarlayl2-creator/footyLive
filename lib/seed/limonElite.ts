/**
 * The `LimonElite` stealth account — automatic seeding.
 *
 * An operator-only test identity used to review the platform the way a top-tier
 * fan sees it, without touching a real account:
 *
 *   • exactly 9,000,000,000 Limon Coins on the server-side wallet
 *   • the Diamond tier (an admin-granted, expiring entitlement — the same
 *     pipeline a paid annual pass runs through, so the animated badge is real)
 *   • the rarest flair (Golden Lemon collector) redeemed from the store
 *   • three pre-populated winning predictions + a career record that settles at
 *     an elite 91% accuracy
 *   • an inbox that demonstrates all three sender identities
 *
 * Everything is written through the *same* server APIs a real mutation uses
 * (wallet, admin tier, predictions, inbox), so the seeded state behaves like
 * production state. Seeding is idempotent and marked as seed data: it never
 * impersonates live fixture data.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';
import { loadWallet, saveWallet, type WalletState } from '@/lib/coins/server';
import { ensureViewer, setViewerBalance } from '@/lib/admin/users';
import { setViewerVipTier, viewerVipRecord, type AdminVipRecord } from '@/lib/admin/vip';
import { writeVote } from '@/lib/predictions/server';
import { seedLeaderboardRow } from '@/lib/leaderboard/server';
import { deliverMessage, readInbox, type DeliverInput } from '@/lib/inbox/server';
import { referenceFor } from '@/lib/inbox';

export const LIMON_ELITE_ID = 'limonelite-0000000000000000000000';
export const LIMON_ELITE_HANDLE = 'LimonElite';
export const LIMON_ELITE_EMAIL = 'limonelite@limon.live';
/** The wallet target: 9 billion coins, to the coin. */
export const LIMON_ELITE_COINS = 9_000_000_000;
/** Career record that rounds to the elite 91% (182 of 200 settled calls). */
/** Career record behind the showcase: 182 correct calls out of 200 settled. */
export const LIMON_ELITE_RECORD = Object.freeze({ settled: 200, correct: 182, bestStreak: 14 });
export const LIMON_ELITE_SETTLED = LIMON_ELITE_RECORD.settled;
export const LIMON_ELITE_CORRECT = LIMON_ELITE_RECORD.correct;
/** The elite figure the account is seeded to display and to keep at. */
export function eliteAccuracy(record = LIMON_ELITE_RECORD): number {
  const settled = Math.max(1, Math.trunc(Number(record.settled) || 1));
  const correct = Math.max(0, Math.min(settled, Math.trunc(Number(record.correct) || 0)));
  return Math.round((correct / settled) * 100);
}

export const LIMON_ELITE_ACCURACY = eliteAccuracy();

const SEED_KEY = 'limon:seed:elite:v1';
const SEED_TTL_S = 400 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ElitePrediction {
  matchId: string;
  home: string;
  away: string;
  score: string;
  prediction: 'home' | 'draw' | 'away';
  outcome: 'correct';
  coins: number;
  at: number;
  competition: string;
}

/** The three headline wins shown on the profile (flagged as seed records). */
export const LIMON_ELITE_PREDICTIONS: readonly ElitePrediction[] = [
  {
    matchId: 'elite-seed-3900114',
    home: 'Raja Club Athletic',
    away: 'Wydad AC',
    score: '2:1',
    prediction: 'home',
    outcome: 'correct',
    coins: REWARD_CORRECT_PREDICTION,
    at: 0,
    competition: 'Botola Pro',
  },
  {
    matchId: 'elite-seed-3721559',
    home: 'Real Madrid',
    away: 'FC Barcelona',
    score: '1:1',
    prediction: 'draw',
    outcome: 'correct',
    coins: REWARD_CORRECT_PREDICTION * 2,
    at: 0,
    competition: 'LaLiga',
  },
  {
    matchId: 'elite-seed-3621874',
    home: 'Manchester City',
    away: 'Arsenal',
    score: '0:2',
    prediction: 'away',
    outcome: 'correct',
    coins: REWARD_CORRECT_PREDICTION * 3,
    at: 0,
    competition: 'Premier League',
  },
] as const;

export interface EliteSeedMarker {
  seededAt: number;
  coins: number;
  accuracy: number;
  version: number;
}

function seedRecord(now: number): EliteSeedMarker {
  return { seededAt: now, coins: LIMON_ELITE_COINS, accuracy: LIMON_ELITE_ACCURACY, version: 2 };
}

async function readMarker(): Promise<EliteSeedMarker | null> {
  try {
    const stored = await getCacheManager().get<EliteSeedMarker>(SEED_KEY);
    if (stored && Number.isFinite(stored.seededAt) && stored.version === 2) return stored;
  } catch (err) {
    logger.warn('Elite seed marker read failed', { error: String(err) });
  }
  return null;
}

async function writeMarker(marker: EliteSeedMarker): Promise<void> {
  try {
    await getCacheManager().set(SEED_KEY, marker, SEED_TTL_S);
  } catch (err) {
    logger.warn('Elite seed marker write failed', { error: String(err) });
  }
}

let inFlight: Promise<EliteSeedMarker> | null = null;

/**
 * Seeds (or re-verifies) the LimonElite account. Safe to call on every read:
 * the wallet, tier, badge, votes and inbox rows are all written idempotently,
 * and concurrent callers share one run.
 */
export async function ensureLimonEliteSeed(now = Date.now()): Promise<EliteSeedMarker> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const marker = await readMarker();
    if (marker && marker.coins === LIMON_ELITE_COINS) return marker;

    // 1. The registry row, so /mounadel can see and mutate the account.
    await ensureViewer(LIMON_ELITE_ID, { handle: LIMON_ELITE_HANDLE, now }).catch(() => undefined);

    // 2. The award history: three paid-out winning predictions, written exactly
    //    as a real settlement would have written them (one row per match id).
    const before = await loadWallet(LIMON_ELITE_ID);
    const missing = LIMON_ELITE_PREDICTIONS.filter((row) => !before.awards.some((award) => award.matchId === row.matchId));
    let wallet = before;
    if (missing.length) {
      const awards = [
        ...before.awards,
        ...missing.map((row, index) => ({
          matchId: row.matchId,
          coins: row.coins,
          at: now - (missing.length - index) * DAY_MS,
          reason: 'correct-prediction' as const,
          ...(row.coins > REWARD_CORRECT_PREDICTION ? { multiplier: row.coins / REWARD_CORRECT_PREDICTION } : {}),
        })),
      ];
      wallet = await saveWallet(LIMON_ELITE_ID, { ...before, awards });
    }

    // 3. The collector flair, issued with the account (a grant, not a purchase —
    //    buying it would move the balance off the exact 9,000,000,000 figure).
    if (!wallet.grants.some((grant) => grant.kind === 'badge' && grant.rewardId === 'golden-lemon-badge')) {
      wallet = await saveWallet(LIMON_ELITE_ID, {
        ...wallet,
        grants: [
          ...wallet.grants,
          {
            id: `grant-golden-lemon-badge-${now}`,
            rewardId: 'golden-lemon-badge',
            kind: 'badge',
            coins: 0,
            at: now,
            expiresAt: 0,
            flair: 'golden-lemon',
            label: 'Golden Lemon collector badge',
            titleAr: 'شارة جامع الليمون الذهبي',
          },
        ],
      });
    }

    // 4. The wallet: exactly 9,000,000,000 coins, through the admin writer, which
    //    also files the ledger row and the provisioning receipt in the inbox.
    await setViewerBalance(LIMON_ELITE_ID, LIMON_ELITE_COINS, 'Stealth review account provisioned by the platform (LimonElite seed).', now);

    // 5. Real vote records, so the server-side fan-stats pipeline agrees with the
    //    showcase (and a reviewer can inspect the same store a fan uses).
    for (const [index, row] of LIMON_ELITE_PREDICTIONS.entries()) {
      await writeVote({
        matchId: row.matchId,
        userId: LIMON_ELITE_ID,
        username: LIMON_ELITE_HANDLE,
        prediction: row.prediction,
        createdAt: now - (LIMON_ELITE_PREDICTIONS.length - index) * DAY_MS,
        updatedAt: now - (LIMON_ELITE_PREDICTIONS.length - index) * DAY_MS,
        changes: 0,
      }).catch(() => undefined);
    }

    // 5b. The global leaderboard carries the same career record (marked as
    //     seed data), so the showcase account ranks with real streaks and
    //     accuracy on /leaderboard. The three seeded matches are flagged as
    //     already settled — re-settling them can never double-count.
    await seedLeaderboardRow({
      userId: LIMON_ELITE_ID,
      handle: LIMON_ELITE_HANDLE,
      settled: LIMON_ELITE_RECORD.settled,
      correct: LIMON_ELITE_RECORD.correct,
      bestStreak: LIMON_ELITE_RECORD.bestStreak,
      at: now,
      settledIds: LIMON_ELITE_PREDICTIONS.map((row) => row.matchId),
    }).catch(() => undefined);

    // 6. Diamond tier: an admin-granted, *expiring* entitlement (365 days) — the
    //    same record a paid annual pass produces, so the badge is genuinely live.
    const current = await loadWallet(LIMON_ELITE_ID);
    if (!current.grants.some((grant) => grant.kind === 'vip' && grant.expiresAt > now)) {
      await setViewerVipTier(LIMON_ELITE_ID, 'diamond', { days: 365, note: 'Seeded with the LimonElite test account.', now });
      await saveWallet(LIMON_ELITE_ID, {
        ...current,
        grants: [
          ...current.grants,
          {
            id: `grant-vip-diamond-${now}`,
            rewardId: 'vip-1-year',
            kind: 'vip',
            planId: 'annual',
            coins: 0,
            at: now,
            expiresAt: now + 365 * DAY_MS,
            label: 'Diamond VIP · 365 days',
            titleAr: 'بطاقة VIP الماسية · سنة كاملة',
          },
        ],
      });
    }

    // 7. An inbox that shows all three sender identities.
    const receipts: Array<{ id: string; draft: DeliverInput }> = [
      {
        id: 'elite-wallet-provisioned',
        draft: {
          from: 'platform',
          kind: 'welcome',
          subject: `LimonElite dossier — ${LIMON_ELITE_COINS.toLocaleString('en-US')} Limon Coins on file`,
          subjectAr: `ملف حساب LimonElite · ${LIMON_ELITE_COINS.toLocaleString('en-US')} عملة ليمون مسجلة`,
          body: 'This is a stealth review account. The balance, the Diamond tier and the collector flair are live on the server wallet, and every reward in the store is redeemable from it. Nothing here is transferable to another account.',
          bodyAr: 'هذا حساب مراجعة سري. الرصيد وفئة الماس والشارة النادرة كلها مسجلة على محفظة الخادم، وكل هدايا المتجر قابلة للاستبدال منه، ولا يمكن تحويل أي شيء منه أو إليه.',
          reference: referenceFor('SEED', LIMON_ELITE_ID),
          pinned: true,
          lines: [
            { label: 'Balance', value: LIMON_ELITE_COINS.toLocaleString('en-US') },
            { label: 'Tier', value: 'Diamond · 365 days' },
            { label: 'Accuracy', value: `${LIMON_ELITE_ACCURACY}%` },
          ],
          action: { href: '/profile#rewards', label: 'Open the Rewards Store' },
        },
      },
      {
        id: 'elite-admin-note',
        draft: {
          from: 'admin',
          kind: 'vip',
          subject: 'Diamond unlocked — you are riding at the top tier',
          subjectAr: 'فئة الماس مفعّلة · أنت الآن في أعلى فئة',
          body: 'I pushed the Diamond tier to this account personally, with the 365-day window. Ad-free FHD/4K, native low-latency playback and the four-screen Multi-View are all on. If anything looks off in the UI, reply here and I will read it tonight.',
          bodyAr: 'فعّلتُ فئة الماس على هذا الحساب بنفسي مع نافذة 365 يوماً. كل شيء يعمل: بدون إعلانات، جودة عالية، Multi-View رباعي. ولاحظتُ أن سجل 3 توقعات رابحة و91% دقة ظاهران في ملفك.',
          priority: 'high',
          action: { href: '/multistream', label: 'Open Multi-View' },
        },
      },
      {
        id: 'elite-support-note',
        draft: {
          from: 'support',
          kind: 'ticket',
          subject: 'Your review ticket is open — we answer in minutes',
          subjectAr: 'تذكرة المراجعة الخاصة بك مفتوحة · نرد خلال دقائق',
          body: 'Anything you flag while testing (a redemption, a payout, a stream that will not start) is triaged against this account and reproduced on our side before we close it. Average first reply today: 6 minutes.',
          bodyAr: 'كل ما تلاحظه أثناء الاختبار — استبدال، جائزة، بث لا يشتغل — يُراجَع على هذا الحساب ويُعاد إنتاجه عندنا قبل الإغلاق. متوسط أول رد اليوم: 6 دقائق.',
          replyWithinMinutes: 6,
          ticketRef: referenceFor('TCK', LIMON_ELITE_HANDLE),
        },
      },
    ];
    for (const row of receipts) {
      await deliverMessage(LIMON_ELITE_ID, { ...row.draft, at: now }).catch(() => undefined);
    }

    const written = seedRecord(now);
    await writeMarker(written);
    return written;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Everything the /elite showcase renders (reads live stores, never a cache). */
export async function limonEliteSnapshot(now = Date.now()) {
  await ensureLimonEliteSeed(now);
  const [wallet, vipRecord, inbox] = await Promise.all([
    loadWallet(LIMON_ELITE_ID),
    viewerVipRecord(LIMON_ELITE_ID, now),
    readInbox(LIMON_ELITE_ID),
  ]);
  return {
    profile: {
      id: LIMON_ELITE_ID,
      handle: LIMON_ELITE_HANDLE,
      email: LIMON_ELITE_EMAIL,
      avatarUrl: 'preset:golden-lemon',
      verified: true,
      kind: 'stealth-admin-review' as const,
    },
    wallet: eliteWalletView(wallet, now, vipRecord),
    stats: {
      settled: LIMON_ELITE_RECORD.settled,
      correct: LIMON_ELITE_RECORD.correct,
      wrong: LIMON_ELITE_RECORD.settled - LIMON_ELITE_RECORD.correct,
      accuracy: eliteAccuracy(),
      streak: LIMON_ELITE_PREDICTIONS.length,
      bestStreak: LIMON_ELITE_RECORD.bestStreak,
      paidWins: wallet.awards.filter((award) => award.matchId.startsWith('elite-seed-')).length,
    },
    predictions: LIMON_ELITE_PREDICTIONS.map((row, index) => ({ ...row, at: row.at || now - (index + 1) * DAY_MS })),
    inbox,
    seeded: true,
    at: now,
  };
}

export function eliteWalletView(wallet: WalletState, now = Date.now(), vipRecord?: AdminVipRecord | null) {
  const vipGrant = wallet.grants
    .filter((grant) => grant.kind === 'vip' && grant.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  const vipActive = Boolean(vipRecord || vipGrant);
  return {
    balance: wallet.balance,
    coins: wallet.balance,
    awards: wallet.awards,
    flairs: wallet.grants.filter((grant) => grant.kind === 'badge').map((grant) => grant.flair ?? grant.rewardId),
    boosts: wallet.grants.filter((grant) => grant.kind === 'boost').length,
    vipActive,
    vipPlanId: vipRecord?.planId ?? vipGrant?.planId ?? 'annual',
    vipTier: vipRecord?.tier ?? 'diamond',
    vipExpiresAt: vipRecord?.expiresAt ?? vipGrant?.expiresAt ?? (now + 365 * DAY_MS),
    spent: wallet.redemptions.reduce((sum, row) => sum + (row.coins || 0), 0),
    version: wallet.version,
  };
}

export const ELITE_WALLET_CONSTANTS = {
  coins: LIMON_ELITE_COINS,
  accuracy: LIMON_ELITE_ACCURACY,
  tier: 'diamond' as const,
  badge: 'golden-lemon' as const,
};

/** Test helper: forgets the seed marker so a suite can watch it seed again. */
export async function resetLimonEliteSeed(): Promise<void> {
  inFlight = null;
  try {
    await getCacheManager().set(SEED_KEY, null as unknown as EliteSeedMarker, 1);
  } catch {
    /* memory-only tests never touch this */
  }
}

