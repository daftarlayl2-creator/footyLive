# EVIV LIVE final sprint: passes, playback and SEO

## Passes and scope

All prices are one-time payments in **MAD**, with no automatic renewal.
Durations begin at the paid entitlement's `startsAt` (epoch milliseconds).

| Plan ID | Pass | Price | Minor units | Maximum duration | Scope |
| --- | --- | ---: | ---: | --- | --- |
| `match` | Single Match Pass | 3 MAD | 300 | 24 hours | One selected live/upcoming fixture |
| `weekly` | Weekly Pass | 15 MAD | 1500 | 7 days | All matches and four-screen Multi-View |
| `monthly` | Monthly VIP Pass | 40 MAD | 4000 | 30 days | All matches and four-screen Multi-View |
| `annual` | Annual VIP Pass | 150 MAD | 15000 | 365 days | All matches and four-screen Multi-View |

Free viewing remains standard HD (up to 720p), with standard EVIV ads and one
screen. Active paid passes suppress EVIV ads across the site. A match pass
upgrades playback **only for its selected fixture** and does not unlock
Multi-View. Other passes unlock source-provided FHD/4K (up to 2160p), native
low-latency playback and four independent players. There is no artificial
paid viewing-session timer. Network/stall watchdogs still switch broken sources.

Resolution and latency depend on the original source, codec, device and network;
there is no upscaling or invented 4K. A 4K label is preserved only when source
metadata reports UHD/4K/2160p. EVIV cannot remove advertisements already encoded
into a broadcaster's video. VIP excludes external iframe players because EVIV
cannot control their scripts/ads, so some free embed-only sources may not be
available to VIP users.

## Production billing setup — required before accepting money

**This repository does not include a connected merchant/payment processor.**
Checkout is intentionally disabled until an external authenticated billing
adapter implements the contract below. No demonstration payment flow grants VIP.
The local fan-account store and Supabase confirmation badge are not payment proof.

Set server-only deployment variables (never `NEXT_PUBLIC_`):

- `BILLING_API_URL`: HTTPS base URL, e.g. `https://billing.example/v1`, without
  URL credentials, query string or fragment.
- `BILLING_API_KEY`: server-to-server bearer token accepted by that adapter.
- `SUBSCRIPTION_SECRET`: stable, random cookie-signing key, at least 32 characters.
- `STREAM_SECRET`: a **different** stable random media-signing key of at least
  32 characters. Known development fallback keys disable paid checkout.
- `SITE_URL`: the canonical production origin, default `https://eviv.live`.
  `NEXT_PUBLIC_SITE_URL` is also supported for metadata. Do not canonicalize
  production content to an ephemeral preview origin.

Generate each signing key independently in your deployment's secret manager, or:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep keys stable across restarts/instances. Rotating the purchase-cookie key
invalidates browser identities; arrange recovery/migration before rotating it.
Reverse proxies must overwrite trusted forwarded host/protocol headers so
same-origin checks and hosted checkout return URLs use the correct public origin.

### Adapter contract

All adapter calls send `Authorization: Bearer <BILLING_API_KEY>`, JSON bodies,
`cache: no-store`, no redirects, an eight-second deadline and a 64-KiB response
limit. The adapter is trusted server infrastructure, **not a browser endpoint**.

**POST `<BILLING_API_URL>/checkout`** receives:

```json
{
  "customerId": "signed-browser-identity-uuid",
  "planId": "match",
  "amountMinor": 300,
  "currency": "MAD",
  "durationDays": 1,
  "matchId": "espn-12345",
  "successUrl": "https://eviv.live/pricing?checkout=success",
  "cancelUrl": "https://eviv.live/pricing?checkout=cancelled"
}
```

The server chooses amount, currency, duration and return URLs, independently of
client input. `matchId` is present only for the match plan, after checking the
fixture exists and has not finished. An `Idempotency-Key` header groups duplicate
customer/plan/fixture requests in a five-minute window. Honor it atomically and
return the same checkout session; also deduplicate processor webhooks by payment
ID. A new window may create a new session, so the processor must still prevent
unintended duplicate settlement and clearly disclose what is being purchased.

Respond with `{ "checkoutUrl": "https://your-processor.example/checkout/..." }`.
Only public HTTPS checkout destinations without URL credentials are accepted.
The adapter must create a real hosted checkout and verify the merchant's signed
settlement/refund webhooks before changing entitlements. Never treat success
return parameters, a client amount, a local account ID or a browser flag as proof.

**GET `<BILLING_API_URL>/entitlements/<customerId>`** returns:

```json
{
  "grants": [{
    "id": "unique-settled-payment-id",
    "planId": "match",
    "status": "paid",
    "currency": "MAD",
    "amountMinor": 300,
    "startsAt": 1792080000000,
    "expiresAt": 1792166400000,
    "matchId": "espn-12345"
  }]
}
```

Use current, accurate timestamps; the example is illustrative only. All-match
plans must **omit** `matchId`. Receipts need unique safe IDs, exact plan amounts,
integer millisecond times, an already-started, unexpired interval no longer than
the plan duration, and a settled `paid` status. Pending, future, expired,
wrong-currency/amount, duplicate and malformed receipts are rejected. Refunds
must remove the grant or change its status so it is rejected on revalidation.
This application exposes no public endpoint for minting or self-awarding grants.

### Browser identity, access and outages

- Same-origin `GET /api/subscription` establishes the HMAC-signed opaque UUID
  cookie `eviv_billing_viewer`: HttpOnly, SameSite=Lax, Secure on HTTPS, Path=/,
  400-day lifetime, renewed with the same identity on successful checkout so a
  later annual purchase is not cut short by an old cookie. The pricing UI
  preflights it before checkout. Checkout returns
  `409` rather than creating a payment against an identity the browser did not
  persist. Cookie-less browsing cannot purchase a usable pass.
- Passes are currently **browser-bound**, independent of the optional fan login.
  Clearing the cookie, switching browsers/devices or changing the cookie key
  loses the identity. Before a public launch, arrange customer support/recovery
  in the adapter, or replace it with a server-verified account binding. Do not
  bind payments to the device-local account store or trust a client user ID.
- The layout seeds verified grants on the server so VIP ad containers/scripts
  never mount initially. Status refreshes every 30 seconds while visible and on
  focus. Exact expiry removes access even if verification is down. A client may
  retain an already-verified, unexpired snapshot during a transient outage;
  fresh server playback authorization fails closed. Refunds take effect on the
  next successful verification. Issued bearer links remain valid until their
  signed expiry (at most four hours, and never beyond the grant's expiry).
- Checkout returns only show a confirmation/cancellation notice. The status
  panel can refresh verified grants; `?checkout=success` never activates a pass.
  Payment failures keep the paywall open and prevent duplicate button submission.
- Personalized status/stream responses are private/no-store and vary by cookie.
  Public fixture lists/homepage client props expose availability counts, not raw
  or uncapped media URLs. Authorization happens after shared resolver caches.

## Playback, IPTV and portraits

- Free proxy links are signed with a 720p ceiling; VIP links with 2160p and the
  earlier of the grant expiry/four-hour bearer lifetime. Child playlist/segment
  links inherit both expiry and ceiling. Free master manifests remove high or
  unknown video variants, alternate-video and iframe-playlist bypasses. This is
  delivery policy, **not DRM**: direct MP4/media-only playlists depend on source
  quality metadata and external media URLs themselves are not made private.
- VIP renews bearer links before their four-hour security expiry, without a
  viewing-duration paywall. Access activation/expiry/refund re-resolves authorized
  sources, and ad-bearing frames are unmounted. Health/failover safeguards remain.
- Guovin primary `https://guovin.github.io/iptv-api/result.m3u` falls back first
  to `https://guovin.github.io/iptv-api/ipv4.m3u`, then official release/gd mirrors.
  IPTV-Org uses `https://iptv-org.github.io/iptv/categories/sports.m3u`, with its
  existing official Contents API fallback. Automatic IPv6-only fallback is off.
- Official pools stay server-side, hidden from navigation. Exact reported Arabic
  MENA beIN targets are `beINSports1.qa@MENA` through `beINSports8.qa@MENA`.
  A cached TVG-ID index prioritizes those IDs and preserves Arabic/MENA metadata;
  foreign editions and invented broadcast rights are excluded.
- Automatic pools require a real media sample. Probes try alternate master
  renditions/newest segments, init maps and published LL-HLS parts, with a shared
  deadline, depth/request/byte bounds and safe redirect checks. Broken/HTML or
  encrypted, unverified sources are not claimed live. When no standard stream
  answers, visible-time retries continue; premium-only results say why they are
  locked instead of pretending they are offline. No third-party uptime guarantee.
- Player profiles prefer identity-checked TheSportsDB render/cutout PNGs, then
  full-size ESPN PNGs and a branded silhouette. No opaque thumbnail fallbacks or
  scraped Transfermarkt images. The transparent cutout sits over the national
  flag and below the jersey badge. Credits are shown when TheSportsDB is used.

## SEO and release verification

`/match/<teams-competition-date>--<stable-id>` is canonical. Old `/match/<id>`
URLs permanently redirect, retaining only valid tab parameters; `/watch/<id>`
continues working with the same canonical. Real fixture facts produce escaped,
server-rendered Schema.org `SportsEvent` JSON-LD; no invented venue, kickoff,
end-time or stadium-ticket offer. Missing fixtures do not emit an event.
Player pages emit `Person` schema. `/sitemap.xml` lists static pages and known
fixtures; `/robots.txt` excludes APIs, account/private pages and Multi-View.
Google crawling/eligibility is not a guarantee of indexing or a rich result.

```sh
npm run test
npm run typecheck
npm run lint
npm run build
```

Unit/integration tests mock the billing adapter and provider transport. Before
launch, additionally test a real sandbox payment, settlement, refund, wrong
amount/currency, repeat webhook, browser recovery and expiry on the configured
merchant. Verify authorized live streams on real desktop/mobile networks and
inspect canonical/JSON-LD output using the production domain. Restricted preview
networks cannot establish real merchant settlement, image availability or live
third-party feed uptime.
