/** Prices and access rules shared by checkout, the player and the paywall. */
export const DAY_MS = 86_400_000;
export const PLANS = [
  { id: 'match', name: 'Single Match Pass', price: 3, amountMinor: 300, days: 1, period: 'one match · 24 hours', scope: 'match', badge: 'One big night' },
  { id: 'weekly', name: 'Weekly Pass', price: 15, amountMinor: 1500, days: 7, period: '7 days', scope: 'all', badge: 'A week of football' },
  { id: 'monthly', name: 'Monthly VIP Pass', price: 40, amountMinor: 4000, days: 30, period: '30 days', scope: 'all', badge: 'Most popular' },
  { id: 'annual', name: 'Annual VIP Pass', price: 150, amountMinor: 15000, days: 365, period: '365 days', scope: 'all', badge: 'Best value' },
] as const;
export type PlanId = typeof PLANS[number]['id'];
export const getPlan = (id: unknown) => PLANS.find((plan) => plan.id === id);
export const validMatchId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(id);

/** Only the server's authenticated billing adapter can supply these grants. */
export interface SubscriptionGrant {
  id: string;
  planId: PlanId;
  startsAt: number;
  expiresAt: number;
  matchId?: string;
  /**
   * Explicit tier override for passes that are not bought from the price list
   * (an admin assigning a tier from /mounadel). Billing grants never carry it.
   */
  tier?: 'bronze' | 'silver' | 'gold' | 'diamond';
}
export interface PlaybackAccess {
  tier: 'free' | 'vip';
  adFree: boolean;
  multiView: boolean;
  maxHeight: 720 | 2160;
  lowLatency: boolean;
  /** No artificial session timer; network/stall watchdogs still protect playback. */
  unlimitedSession: boolean;
  expiresAt: number | null;
}

/** Reject unpaid, wrong-currency/amount, overlong, expired and malformed receipts. */
export function validateGrants(payload: unknown, now = Date.now()): SubscriptionGrant[] {
  const rows = (payload as { grants?: unknown })?.grants;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.slice(0, 100).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const plan = getPlan(row.planId);
    if (!plan || row.status !== 'paid' || row.currency !== 'MAD' || row.amountMinor !== plan.amountMinor ||
        typeof row.id !== 'string' || !/^[\w.-]{1,120}$/.test(row.id) || seen.has(row.id) ||
        !Number.isSafeInteger(row.startsAt) || !Number.isSafeInteger(row.expiresAt) ||
        row.startsAt > now || row.startsAt < 0 || row.expiresAt <= now || row.expiresAt <= row.startsAt ||
        row.expiresAt > row.startsAt + plan.days * DAY_MS ||
        (plan.scope === 'match' ? !validMatchId(row.matchId) : row.matchId != null)) return [];
    seen.add(row.id);
    return [{ id: row.id, planId: plan.id, startsAt: row.startsAt, expiresAt: row.expiresAt,
      ...(plan.scope === 'match' ? { matchId: row.matchId } : {}) }];
  });
}

export function subscriptionAccess(grants: SubscriptionGrant[], matchId?: string, now = Date.now()): PlaybackAccess {
  const active = grants.filter((grant) => grant.startsAt <= now && grant.expiresAt > now && getPlan(grant.planId));
  const all = active.filter((grant) => getPlan(grant.planId)?.scope === 'all');
  const eligible = active.filter((grant) => getPlan(grant.planId)?.scope === 'all' || (Boolean(matchId) && grant.matchId === matchId));
  const vip = eligible.length > 0;
  return {
    tier: vip ? 'vip' : 'free', adFree: active.length > 0, multiView: all.length > 0,
    maxHeight: vip ? 2160 : 720, lowLatency: vip, unlimitedSession: vip,
    expiresAt: eligible.length ? Math.max(...eligible.map((grant) => grant.expiresAt)) : null,
  };
}
export const FREE_ACCESS = Object.freeze(subscriptionAccess([]));
