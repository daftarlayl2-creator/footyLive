/**
 * Rewards Store catalogue — the single source of truth for everything a fan can
 * buy with Limon Coins.
 *
 * The client (`components/coins/RewardsStore.jsx`), the API route
 * (`app/api/wallet/route.ts`) and the redemption engine (`lib/coins/server.ts`)
 * all read this module, so a reward shown in the UI can never be a reward the
 * backend refuses to sell — the exact bug that used to reject `Badges` and
 * `Boosts` with "reward not valid" while the store happily advertised them.
 *
 * Pure data + pure helpers only: no server imports, so it is safe to bundle.
 */

/** What a redeemed reward actually *does* to the account. */
export type RewardKind = 'vip' | 'badge' | 'boost';

export type RewardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface RewardDefinition {
  id: string;
  /** English headline shown on the card. */
  title: string;
  /** Arabic headline (RTL) — the platform ships bilingual sender/receipt copy. */
  titleAr: string;
  /** Price in Limon Coins. Integer, always > 0. */
  cost: number;
  kind: RewardKind;
  /** VIP passes map onto a billing plan id so a redeemed pass is a real entitlement. */
  planId?: 'match' | 'weekly' | 'monthly' | 'annual';
  /** Days of access the grant buys (vip only). */
  days?: number;
  /** Boost power: the payout multiplier applied to the next correct prediction. */
  multiplier?: number;
  /** How many correct predictions the boost pays out for. */
  charges?: number;
  /** Flair id a badge unlocks (badge only). */
  flair?: 'supporter' | 'golden-lemon';
  blurb: string;
  blurbAr: string;
  perk: string;
  rarity: RewardRarity;
  icon: 'crown' | 'gem' | 'ticket' | 'shield' | 'zap';
  featured?: boolean;
}

/** A boosted payout can never stack beyond this multiplier (anti-inflation). */
export const MAX_BOOST_MULTIPLIER = 6;
/** Hard ceiling on stored boost charges, so a whale cannot hoard forever. */
export const MAX_BOOST_CHARGES = 6;
/** Badges are cosmetic and permanent: redeeming one twice is never allowed. */
export const BADGE_RETRY_REASON = 'badge-owned';

export const REWARD_LIST: readonly RewardDefinition[] = [
  {
    id: 'vip-1-month',
    title: 'VIP Pass · 1 month',
    titleAr: 'بطاقة VIP · شهر كامل',
    cost: 20_000,
    kind: 'vip',
    planId: 'monthly',
    days: 30,
    blurb: 'Ad-free FHD/4K where available, low-latency native playback and four-screen Multi-View.',
    blurbAr: 'بدون إعلانات، جودة 4K عند التوفر، تشغيل فوري وشاشة رباعية.',
    perk: 'Full site-wide VIP access',
    rarity: 'legendary',
    icon: 'crown',
    featured: true,
  },
  {
    id: 'vip-1-year',
    title: 'VIP Pass · 12 months',
    titleAr: 'بطاقة VIP · اثنا عشر شهراً',
    cost: 180_000,
    kind: 'vip',
    planId: 'annual',
    days: 365,
    blurb: 'A full season of ad-free football with the animated Diamond tier badge.',
    blurbAr: 'موسم كامل بدون إعلانات مع شارة الماس المتحركة.',
    perk: 'Diamond tier for a year',
    rarity: 'legendary',
    icon: 'gem',
  },
  {
    id: 'vip-1-week',
    title: 'VIP Pass · 7 days',
    titleAr: 'بطاقة VIP · سبعة أيام',
    cost: 6_000,
    kind: 'vip',
    planId: 'weekly',
    days: 7,
    blurb: 'A week of ad-free football — good for a busy run of fixtures.',
    blurbAr: 'أسبوع كامل من الكرة بدون إعلانات في أيام الضغط.',
    perk: '7 days ad-free',
    rarity: 'rare',
    icon: 'ticket',
  },
  {
    // Sold as a 24-hour pass: a `match`-scoped plan would need a specific
    // fixture id, and a coin redemption never knows which match you will watch.
    id: 'vip-24-hours',
    title: 'VIP Pass · 24 hours',
    titleAr: 'بطاقة VIP · أربع وعشرون ساعة',
    cost: 1_200,
    kind: 'vip',
    planId: 'weekly',
    days: 1,
    blurb: 'A full day of site-wide VIP: the whole slate in FHD with no artificial timer.',
    blurbAr: 'يوم كامل من VIP على كل المباريات بأعلى جودة وبدون مؤقت.',
    perk: '24 hours site-wide',
    rarity: 'common',
    icon: 'ticket',
  },
  {
    id: 'coin-badge',
    title: 'Limon Supporter badge',
    titleAr: 'شارة داعم الليمون',
    cost: 2_500,
    kind: 'badge',
    flair: 'supporter',
    blurb: 'A glowing supporter flair next to your name in match chat and on your profile.',
    blurbAr: 'توهّج رسمي بجانب اسمك في دردشة المباريات وفي ملفك.',
    perk: 'Permanent chat flair',
    rarity: 'epic',
    icon: 'shield',
  },
  {
    id: 'golden-lemon-badge',
    title: 'Golden Lemon collector badge',
    titleAr: 'شارة جامع الليمون الذهبي',
    cost: 9_000,
    kind: 'badge',
    flair: 'golden-lemon',
    blurb: 'The rarest flair on the platform: an animated golden lemon beside your name.',
    blurbAr: 'أندر شارة في المنصة: ليمونة ذهبية متحركة بجانب اسمك.',
    perk: 'Animated collector flair',
    rarity: 'legendary',
    icon: 'gem',
  },
  {
    id: 'coin-boost',
    title: 'Prediction boost ×2',
    titleAr: 'مضاعفة التوقع ×2',
    cost: 1_500,
    kind: 'boost',
    multiplier: 2,
    charges: 1,
    blurb: 'Doubles the coin reward on your next correct full-time prediction.',
    blurbAr: 'يضاعف جوائزك مرتين في أول توقع صحيح قادم.',
    perk: '×2 next reward',
    rarity: 'rare',
    icon: 'zap',
  },
  {
    id: 'coin-boost-mega',
    title: 'Prediction boost ×3 (3 matches)',
    titleAr: 'مضاعفة التوقع ×3 لثلاث مباريات',
    cost: 5_000,
    kind: 'boost',
    multiplier: 3,
    charges: 3,
    blurb: 'Triples the reward on your next three correct full-time predictions.',
    blurbAr: 'يضاعف جوائزك ثلاث مرات في أول ثلاثة توقعات صحيحة.',
    perk: '×3 next three rewards',
    rarity: 'epic',
    icon: 'zap',
  },
] as const;

const BY_ID: ReadonlyMap<string, RewardDefinition> = new Map(REWARD_LIST.map((reward) => [reward.id, reward]));

/** The reward definition for an id (undefined when the id is not on the menu). */
export function findReward(id: unknown): RewardDefinition | undefined {
  return typeof id === 'string' ? BY_ID.get(id) : undefined;
}

export function isRewardId(id: unknown): id is string {
  return findReward(id) !== undefined;
}

/** Price of a reward in coins; 0 for an id the platform does not sell. */
export function rewardCost(id: unknown): number {
  return findReward(id)?.cost ?? 0;
}

/** The headline reward, used by copy and by the legacy single-reward helpers. */
export const FEATURED_REWARD: RewardDefinition = BY_ID.get('vip-1-month') ?? REWARD_LIST[0];

/** Every VIP pass the store sells (the entitlement engine iterates these). */
export const VIP_REWARDS: readonly RewardDefinition[] = REWARD_LIST.filter((reward) => reward.kind === 'vip');

/** Ids only — cheap to embed in tests and in sanitized storage allow-lists. */
export const REWARD_IDS: readonly string[] = REWARD_LIST.map((reward) => reward.id);

/** Days of access a redeemed pass buys (0 when the reward is not a VIP pass). */
export function rewardDurationMs(reward: RewardDefinition | undefined): number {
  if (!reward || reward.kind !== 'vip' || !reward.days) return 0;
  return reward.days * 24 * 60 * 60 * 1000;
}

/** How much boost power a reward grants (never above the anti-inflation cap). */
export function rewardBoost(reward: RewardDefinition | undefined) {
  if (!reward || reward.kind !== 'boost') return null;
  const multiplier = Math.min(MAX_BOOST_MULTIPLIER, Math.max(2, Math.trunc(Number(reward.multiplier) || 2)));
  const charges = Math.min(MAX_BOOST_CHARGES, Math.max(1, Math.trunc(Number(reward.charges) || 1)));
  return { multiplier, charges };
}

/** Rarity palette used by the card chrome (kept here so admin + fan UI agree). */
export const RARITY_STYLE: Record<RewardRarity, { label: string; className: string; ring: string }> = {
  common: { label: 'Common', className: 'text-zinc-200', ring: 'ring-white/10' },
  rare: { label: 'Rare', className: 'text-sky-200', ring: 'ring-sky-400/30' },
  epic: { label: 'Epic', className: 'text-fuchsia-200', ring: 'ring-fuchsia-400/35' },
  legendary: { label: 'Legendary', className: 'text-amber-200', ring: 'ring-amber-300/40' },
};
