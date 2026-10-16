import { describe, expect, it } from 'vitest';
import { DAY_MS, FREE_ACCESS, PLANS, subscriptionAccess, validateGrants } from './plans';

const now = Date.parse('2026-10-15T18:00:00Z');
const receipt = (overrides: Record<string, unknown> = {}) => ({ id: 'settled-1', planId: 'monthly', status: 'paid', currency: 'MAD', amountMinor: 4000, startsAt: now - 1000, expiresAt: now + 29 * DAY_MS, ...overrides });
const grants = (overrides = {}) => validateGrants({ grants: [receipt(overrides)] }, now);

describe('subscription pricing and scoped access', () => {
  it('has exactly four fixed MAD tiers with trusted minor-unit amounts', () => {
    expect(PLANS.map(({ id, price, amountMinor }) => [id, price, amountMinor])).toEqual([['match', 3, 300], ['weekly', 15, 1500], ['monthly', 40, 4000], ['annual', 150, 15000]]);
  });
  it('keeps free viewers on ad-supported single-screen standard HD', () => {
    expect(FREE_ACCESS).toMatchObject({ tier: 'free', adFree: false, maxHeight: 720, lowLatency: false, multiView: false });
  });
  it('unlocks all VIP features for a valid site-wide receipt', () => {
    expect(subscriptionAccess(grants(), 'espn-1', now)).toMatchObject({ tier: 'vip', adFree: true, multiView: true, maxHeight: 2160, lowLatency: true, unlimitedSession: true });
  });
  it('binds the match pass to one fixture, not an entire multi-screen catalogue', () => {
    const single = grants({ planId: 'match', amountMinor: 300, matchId: 'espn-1', expiresAt: now + 1000 });
    expect(subscriptionAccess(single, 'espn-1', now)).toMatchObject({ tier: 'vip', maxHeight: 2160, multiView: false, adFree: true });
    expect(subscriptionAccess(single, 'espn-2', now)).toMatchObject({ tier: 'free', maxHeight: 720, multiView: false, adFree: true });
    expect(subscriptionAccess(single, undefined, now).tier).toBe('free');
  });
  it.each([
    { status: 'pending' }, { status: 'refunded' }, { amountMinor: 3 }, { currency: 'USD' }, { planId: 'admin' },
    { expiresAt: now }, { startsAt: now + 1000 }, { expiresAt: now + 31 * DAY_MS }, { matchId: 'espn-1' },
    { startsAt: '2026-10-15' }, { id: '' },
  ])('rejects malformed, unpaid or forged grant fields: %j', (overrides) => {
    expect(grants(overrides)).toEqual([]);
  });
  it('expires access on the exact boundary and combines multiple legitimate passes', () => {
    const active = grants();
    expect(subscriptionAccess(active, 'espn-1', active[0].expiresAt)).toEqual(FREE_ACCESS);
    const more = validateGrants({ grants: [receipt(), receipt({ id: 'settled-2', expiresAt: now + 30 * DAY_MS - 1000 })] }, now);
    expect(subscriptionAccess(more, 'espn-1', now).expiresAt).toBe(now + 30 * DAY_MS - 1000);
    expect(validateGrants({ grants: [receipt(), receipt()] }, now)).toHaveLength(1);
  });
  it('does not interpret absent receipts or a local VIP flag as payment', () => {
    for (const value of [null, [], 'vip', { tier: 'vip' }, { grants: [null, false] }]) expect(validateGrants(value, now)).toEqual([]);
    expect(grants({ planId: 'match', amountMinor: 300, expiresAt: now + 1000 })).toEqual([]);
    expect(grants({ planId: 'match', amountMinor: 300, expiresAt: now + 1000, matchId: '../secret' })).toEqual([]);
  });
});
