/**
 * Redemption failure copy — one sentence per refusal, in one place.
 *
 * The Rewards Store only ever shows what this module returns, so a fan can never
 * meet the old vague "reward not valid" screen again: every `RedeemFailure` the
 * engine can produce has a specific, bilingual-friendly message with the real
 * numbers (price, shortfall, boost cap) in it. `lib/rewards/messages.test.ts`
 * asserts that mapping stays complete as reasons are added.
 */
import type { RedeemFailure } from '@/lib/coins/server';

export interface RedeemContext {
  /** Price of the reward the fan tried to buy. */
  cost: number;
  /** Title of that reward. */
  title: string;
  /** How many coins the fan is short (0 when affordability was not the problem). */
  needed: number;
}

export interface RedeemMessage {
  status: number;
  error: string;
}

/**
 * Reason → HTTP status + the sentence the fan reads. The keys mirror
 * `RedeemFailure` exactly; a missing key falls back to `fallbackMessage`.
 */
export const REDEEM_MESSAGES: Record<RedeemFailure, (context: RedeemContext) => RedeemMessage> = {
  'insufficient-coins': ({ cost, needed, title }) => ({
    status: 409,
    error: `You need ${needed.toLocaleString('en-US')} more Limon Coins for ${title} (price ${cost.toLocaleString('en-US')}).`,
  }),
  'already-active': () => ({
    status: 409,
    error: 'This reward is already running on your account.',
  }),
  'unknown-reward': () => ({
    status: 400,
    error: 'That reward is not on the menu. Open the store again and pick one of the listed rewards.',
  }),
  'missing-viewer': () => ({
    status: 403,
    error: 'Open this page with cookies enabled to use the wallet.',
  }),
  'badge-owned': () => ({
    status: 409,
    error: 'You already own this badge — flairs are permanent, so there is nothing to buy twice.',
  }),
  'boost-full': () => ({
    status: 409,
    error: 'Your boost queue is full (6 charges maximum). Spend a boost on a prediction, then come back.',
  }),
};

/** Last-resort copy: honest, and it promises the balance was untouched. */
export function fallbackMessage(): RedeemMessage {
  return { status: 409, error: 'This reward could not be redeemed right now — your coins are safe. Please try again.' };
}

/**
 * Resolves a refusal into a response body. Big-ticket purchases (20,000+ coins)
 * look exactly like small ones: the price is checked against the stored balance,
 * the shortfall is stated in numbers, and the perk is granted in the same write.
 */
export function redeemFailureMessage(reason: RedeemFailure | undefined, context: RedeemContext): RedeemMessage {
  const handler = reason ? REDEEM_MESSAGES[reason] : undefined;
  return handler ? handler(context) : fallbackMessage();
}

/** Reasons the engine can return, exported for tests and the docs. */
export const REDEEM_FAILURE_REASONS = Object.keys(REDEEM_MESSAGES) as RedeemFailure[];
