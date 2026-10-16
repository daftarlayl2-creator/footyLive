/**
 * Tiered VIP identity: every pass unlocks a colour-coded fan badge.
 *
 *   Bronze  → Single Match Pass  (3 MAD)
 *   Silver  → Weekly Pass        (15 MAD)
 *   Gold    → Monthly VIP Pass   (40 MAD)      ← trophy badge
 *   Diamond → Annual VIP Pass    (150 MAD)     ← gem badge
 *
 * `vipTierFromGrants` picks the highest tier an active grant set currently
 * unlocks (annual outranks monthly, and so on). Pure functions only — the
 * badge component and the pricing cards both read from here so the four
 * tiers can never drift apart.
 */
import type { PlanId, SubscriptionGrant } from '@/lib/subscription/plans';

export type VipTierId = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface VipTier {
  id: VipTierId;
  /** Plan(s) that unlock this tier. */
  planIds: readonly PlanId[];
  label: string;
  /** Short label used on chips/badges. */
  short: string;
  /** Badge palette: face gradient top → bottom, keyline and glow colour. */
  face: string;
  deep: string;
  edge: string;
  glow: string;
  /** Ink on light faces (text/mark drawn inside the badge). */
  ink: string;
  /** Which emblem VipBadge draws. */
  emblem: 'medal' | 'shield' | 'trophy' | 'gem';
}

export const VIP_TIERS: readonly VipTier[] = [
  {
    id: 'bronze', planIds: ['match'], label: 'Bronze Pass', short: 'BRONZE',
    face: '#E0A068', deep: '#6B3B1E', edge: '#F4C08A', glow: 'rgba(224,160,104,0.55)', ink: '#3A1C0E', emblem: 'medal',
  },
  {
    id: 'silver', planIds: ['weekly'], label: 'Silver Pass', short: 'SILVER',
    face: '#E8EDF4', deep: '#8D99A8', edge: '#FFFFFF', glow: 'rgba(202,214,228,0.55)', ink: '#3D4756', emblem: 'shield',
  },
  {
    id: 'gold', planIds: ['monthly'], label: 'Gold VIP', short: 'GOLD',
    face: '#FFE27A', deep: '#C8901A', edge: '#FFF3B8', glow: 'rgba(255,210,74,0.6)', ink: '#5E3B05', emblem: 'trophy',
  },
  {
    id: 'diamond', planIds: ['annual'], label: 'Diamond VIP', short: 'DIAMOND',
    face: '#B8FBFF', deep: '#3BA7C9', edge: '#E8FEFF', glow: 'rgba(125,249,255,0.6)', ink: '#0B4356', emblem: 'gem',
  },
] as const;

const RANK: Record<VipTierId, number> = { bronze: 0, silver: 1, gold: 2, diamond: 3 };

/** Rank for tier comparisons (higher = more premium). */
export function vipTierRank(id: unknown): number {
  return RANK[id as VipTierId] ?? -1;
}

/** The tier a plan unlocks (undefined for unknown plans). */
export function tierForPlan(planId: unknown): VipTier | undefined {
  return VIP_TIERS.find((tier) => (tier.planIds as readonly unknown[]).includes(planId));
}

/**
 * Highest tier currently unlocked by active grants. Coin-redeemed monthly
 * passes are plain `monthly` grants, so they earn Gold exactly like paid ones.
 */
export function vipTierFromGrants(
  grants: ReadonlyArray<Pick<SubscriptionGrant, 'planId' | 'expiresAt' | 'startsAt'>> | null | undefined,
  now = Date.now(),
): VipTier | null {
  let best: VipTier | null = null;
  for (const grant of grants || []) {
    if (!grant || typeof grant !== 'object') continue;
    if (!Number.isFinite(grant.startsAt) || !Number.isFinite(grant.expiresAt)) continue;
    if (grant.startsAt > now || grant.expiresAt <= now) continue;
    const tier = tierForPlan(grant.planId);
    if (tier && (!best || vipTierRank(tier.id) > vipTierRank(best.id))) best = tier;
  }
  return best;
}

/** Headline tier price used by the pricing page footnotes ("from 3 MAD"). */
export const VIP_TIER_PRICES: Record<VipTierId, number> = { bronze: 3, silver: 15, gold: 40, diamond: 150 };
