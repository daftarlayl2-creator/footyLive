# EVIV Coins, predictions and the Rewards Store

Everything in this document is enforced **on the server**. The browser is a view:
it can display a number, ask for an action and animate a coin — it can never
decide what a vote is worth or how many coins a fan owns.

---

## 1. The EVIV Coin

| Property | Value |
| --- | --- |
| Name / symbol | **EVIV Coin** · `E` |
| Art | Lime `#CCFF00` ring around a deep-burgundy `#2A0813` core with an engraved `E` and a glowing aura (`components/coins/EvivCoin.jsx`, `.eviv-coin*` in `app/globals.css`) |
| Motion | Pure-CSS 3D (`perspective` + `rotateY`) idle spin, aura pulse and a one-shot burst on a payout. All of it stops under `prefers-reduced-motion: reduce`. |
| Reward per correct prediction | **500 coins** (`REWARD_CORRECT_PREDICTION`) |
| 1-month VIP pass | **20,000 coins** (`VIP_PASS_COIN_COST`, `VIP_PASS_DURATION_DAYS = 30`) |

Surfaces: the header wallet chip (`components/coins/WalletBadge.jsx` → `/profile#rewards`),
the profile wallet card (`components/coins/WalletCard.jsx`), the rewards store
(`components/coins/RewardsStore.jsx`) and the predictor's payout animation
(`components/predictions/VotingBar.jsx`).

---

## 2. Fan identity: a signed viewer cookie

`lib/coins/session.ts` mints `limon_wallet_viewer = <uuid>.<hmac-sha256>`:

* the HMAC is verified with `timingSafeEqual` on every request;
* a forged or hand-edited cookie is rejected and a **new** genuine id is issued;
* the id is the `user_id` of the `user_id + match_id` vote key and the wallet key,
  so a client-supplied `userId` in a request body is ignored by design.

The secret is `SUBSCRIPTION_SECRET` → `STREAM_SECRET` → the built-in fallback
(set a strong `STREAM_SECRET` in production, as `docs/subscriptions.md` explains).

---

## 3. Predictions ("Who will win?")

```
GET  /api/predictions/{matchId}   → server tally, this viewer's pick, lock state
POST /api/predictions/{matchId}   → cast/change one vote (JSON: { prediction, username })
```

Rules applied **server-side** (`lib/predictions/antiCheat.ts`, `lib/predictions/server.ts`):

1. **One vote per fan per match.** The stored key *is* `user_id + match_id`
   (`limon:prediction:v1:{matchId}:{userId}`), so a second vote updates the same
   row (`changes++`) instead of adding a new one. An attacker cannot "vote twice"
   by clearing `localStorage` — the identity comes from the cookie, not the browser.
2. **Automatic lock at kick-off.** The kick-off time and the match phase are
   fetched by the server from the same provider the scoreboard uses; a request
   arriving at/after kick-off (with a few seconds of clock-skew tolerance) is
   refused with `409 locked-kickoff`. A live or finished fixture is refused too
   (`locked-started` / `locked-finished`) — nobody can "predict" a score that is
   already on the board.
3. **Only three legal outcomes**, validated match ids, sanitised usernames and
   server-clock timestamps.
4. **The server tally wins.** The bar renders the backend's counts and its record
   of *your* pick; a hand-edited `eviv:vote:{id}` entry in localStorage is
   corrected on load instead of being trusted.
5. **Offline is explicit.** If the API cannot be reached, the vote is kept on the
   device and the UI says *"saved on this device"* — it is never presented as a
   verified vote and it can never pay out.

---

## 4. Coin settlement

```
GET  /api/wallet                       → balance, awards, redemptions, VIP window
POST /api/wallet { action: "settle", matchIds: [...] }
POST /api/wallet { action: "redeem", reward: "vip-1-month" }
```

* **Settlement** runs on the backend: for each requested match the server reads
  *its own* vote for this viewer, fetches the real fixture, computes the outcome
  from the final score (`lib/predictions/antiCheat.ts → settleVote`) and credits
  `500` coins — **once per match, ever** (the award ledger is keyed by match id).
  A wrong pick, an unfinished match or a match this viewer never voted on pays
  zero (`wrong` / `not-finished` / `no-vote`).
* The predictor triggers settlement for the matches it knows about, and the
  profile wallet settles every vote the fan has made. Because the client only
  supplies *which* matches to check, it cannot invent a winning pick.
* **Redemption** is validated against the server-stored balance: below 20,000
  coins the request is refused with `409 insufficient-coins`; at or above it the
  coins are deducted and a 30-day `monthly` grant is written. A second redemption
  **stacks** onto the running pass instead of discarding it.

### Coins buy real access

`lib/subscription/server.ts` merges the coin grants with the paid billing grants
before computing `subscriptionAccess(...)`, so a redeemed pass unlocks the same
ad-free FHD/4K, low-latency playback and Multi-View as a paid one — and the
entitlement lives on the server, next to the wallet, not in the browser.

---

## 5. Storage

Votes and wallets go through the shared cache manager (`lib/cache/cacheManager.ts`):
Upstash Redis when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set,
an in-process store otherwise. Both layers keep an in-process copy so a short
Redis outage never loses a vote in the current session and never invents a
balance. For a multi-instance production deployment, configure Redis.

---

## 6. Tests

| Suite | Covers |
| --- | --- |
| `lib/coins.test.ts` | balance maths, one reward per match, 20,000-coin pass |
| `lib/predictions/antiCheat.test.ts` | vote validation, kick-off lock, settlement maths |
| `lib/predictions/server.test.ts` | one row per `user_id + match_id`, tallies, forged rows |
| `lib/coins/server.test.ts` | signed cookie, single credit per match, redemption stacking |
| `lib/subscription/coinGrants.test.ts` | a redeemed pass unlocks (and expires) VIP access |
| `app/api/predictions/predictions.route.test.ts` | HTTP boundary: lock, single vote, forged cookie, refused outcomes |
| `app/api/wallet/wallet.route.test.ts` | payout once, no payout for wrong/live/unknown, redemption rules |
| `components/predictions/votingServer.test.jsx` | the UI adopts the server tally/lock and mirrors credits |
| `components/coins/coins.test.jsx` | the 3D coin mark, wallet badge, rewards store behaviour |
