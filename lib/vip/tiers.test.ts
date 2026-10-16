import { describe, expect, it } from 'vitest';
import { VIP_TIERS, tierForPlan, vipTierFromGrants, vipTierRank, VIP_TIER_PRICES } from './tiers';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const DAY = 86_400_000;

const grant = (planId: string, offsetDays = 10) => ({
  id: `g-${planId}`,
  planId: planId as any,
  startsAt: NOW - DAY,
  expiresAt: NOW + offsetDays * DAY,
});

describe('VIP tiers', () => {
  it('maps every pass to its colour-coded tier in MAD order', () => {
    expect(tierForPlan('match')?.id).toBe('bronze');
    expect(tierForPlan('weekly')?.id).toBe('silver');
    expect(tierForPlan('monthly')?.id).toBe('gold');
    expect(tierForPlan('annual')?.id).toBe('diamond');
    expect(tierForPlan('nope')).toBeUndefined();

    // The published MAD ladder: 3 / 15 / 40 / 150.
    expect(VIP_TIER_PRICES).toEqual({ bronze: 3, silver: 15, gold: 40, diamond: 150 });
    expect(VIP_TIERS.map((tier) => tier.emblem)).toEqual(['medal', 'shield', 'trophy', 'gem']);
  });

  it('ranks annual above monthly, weekly and single-match passes', () => {
    expect(vipTierRank('diamond')).toBeGreaterThan(vipTierRank('gold'));
    expect(vipTierRank('gold')).toBeGreaterThan(vipTierRank('silver'));
    expect(vipTierRank('silver')).toBeGreaterThan(vipTierRank('bronze'));
    expect(vipTierRank('free')).toBe(-1);
  });

  it('picks the highest ACTIVE grant tier', () => {
    expect(vipTierFromGrants([], NOW)).toBeNull();
    expect(vipTierFromGrants([grant('weekly')], NOW)?.id).toBe('silver');
    expect(vipTierFromGrants([grant('weekly'), grant('annual')], NOW)?.id).toBe('diamond');
    expect(vipTierFromGrants([grant('match'), grant('monthly')], NOW)?.id).toBe('gold');
  });

  it('ignores expired, not-yet-started and malformed grants', () => {
    expect(vipTierFromGrants([grant('diamond', -1)], NOW)).toBeNull(); // expired yesterday
    const future = { ...grant('gold'), startsAt: NOW + DAY };
    expect(vipTierFromGrants([future], NOW)).toBeNull();
    expect(vipTierFromGrants([{ planId: 'gold' } as any], NOW)).toBeNull();
    expect(vipTierFromGrants(null, NOW)).toBeNull();
  });

  it('coin-redeemed monthly passes behave like paid Gold VIP', () => {
    expect(vipTierFromGrants([grant('monthly')], NOW)).toMatchObject({ id: 'gold', emblem: 'trophy' });
  });
});
