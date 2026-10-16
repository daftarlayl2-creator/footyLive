/**
 * Wallet entry point.
 *
 * `lib/coins.ts` holds the pure EVIV Coin helpers shared by the client and the
 * server; `lib/coins/server.ts` is the authoritative wallet (balances, rewards,
 * redemptions) and `lib/coins/session.ts` mints the signed viewer id.
 */
export * from './coins';
