# Confirmation links, player showcases and smart Multi-View

## Supabase confirmation setup

The application uses GoTrue's REST API and the existing browser auth store; no
Supabase SDK or service-role key is required. Configure both public variables
from `.env.example` and rebuild:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
```

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to your public application origin, for example
   `https://your-football-app.example`.
2. Allow these exact redirects for your deployment:
   - `https://your-football-app.example/auth/callback`
   - `https://your-football-app.example/auth/confirm` (optional template alias)
   - `http://localhost:3000/auth/callback` for local development
3. For an Arena preview, also add its exact
   `https://<port>-<sandbox-id>.e2b.app/auth/callback` URL. Avoid broad production
   redirect wildcards, especially across unrelated preview tenants.

Sign-up automatically supplies the current origin's `/auth/callback` redirect
and an S256 PKCE challenge. The normal `{{ .ConfirmationURL }}` email template
works when the link is opened in the same browser that initiated sign-up.
The verifier cookie is scoped to `/auth` and lasts one hour.

### Cross-browser / cross-device email confirmation

To avoid requiring the original browser's verifier, use a token-hash link in
**Authentication → Email Templates → Confirm signup**:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">
  Confirm your email
</a>
```

This app supplies `.RedirectTo` as the current public `/auth/callback` URL for
sign-up and resend. For a deliberately fixed production destination, the
alternative is
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
Never include access or refresh tokens in email-template application URLs.

### What happens on return

- `/auth/callback` and `/auth/confirm` accept a PKCE `code` or an email
  `token_hash`, exchange/verify it with GoTrue, and send a **303** to `/profile`.
  Caller-provided `next` destinations are ignored. Password recovery is not
  handled by this confirmation endpoint.
- A 120-second, HttpOnly, SameSite=Lax handoff cookie transfers the session via
  a same-origin **POST `/auth/session`**. It is Secure on HTTPS, consumed and
  cleared, and all auth responses are private/no-store. The browser validates
  the user with GoTrue before persisting the existing auth session.
- Previously issued implicit-flow `#access_token=…` links are consumed and
  scrubbed from browser history immediately. React StrictMode does not consume
  a handoff twice.
- Missing, used, expired, malformed, cross-browser-PKCE and unavailable-service
  cases return to the sign-in panel with a readable banner, never a callback
  404. In Supabase mode, the panel can resend confirmation email.
- Reverse proxies must **overwrite trusted `X-Forwarded-Host` and
  `X-Forwarded-Proto`** headers with the public host/protocol. These determine
  public redirect URLs, Secure cookies and browser Origin checks.

## Player showcases

Every squad card links to `/player/[id]`, with optional validated `club` and
`league` context so a real roster can serve as an identity fallback.

The page has an age/position/nationality banner, flag, linked club crest,
dated market-value estimate, five responsive season metrics, and an
interactive glass **Trophy cabinet / الفيترينة**. Trophy filters distinguish
individual honors from team trophies; expanding a card reveals seasons and
its source link. Unknown IDs get a helpful not-found page, and upstream
outages get a retryable error boundary.

Data rules:

- ESPN soccer's base common-v3 athlete endpoint supplies identity; its
  `/overview` supplies separate competition/team splits. The club roster and
  optional stats table fill in available fields. The loader caches for ten
  minutes and keeps national-team/other-competition totals out of club stats.
- Apps, Goals, Assists, Minutes played and Pass accuracy are rendered even
  when coverage is partial. A dash means **not reported**, not zero. ESPN does
  not consistently expose minutes, passing statistics, honors or valuations.
  Current statistics are never invented; historical seasons are labelled.
- The three showcase examples have **selected, sourced honors through 2024**
  when provider honors are absent, plus explicitly historical October 21,
  2024 valuation estimates. These are not live transfer prices or complete
  career trophy totals. Enrichment requires the exact player name and matching
  birth date; upstream honors/valuations take precedence. See
  `lib/players/showcase.ts` for the source links. The historical valuation
  reference is LaLiga's dated report:
  [3](https://www.laliga.com/en-US/news/lamine-yamal-becomes-the-most-valuable-spanish-footballer-ever).
- A trimmed live ESPN contract response, with retrieval date and source URLs,
  lives in `lib/players/__fixtures__/common-soccer-yamal.json` for regression
  tests. It is test data, not a production fallback.

## Smart IPTV and Multi-View

Configure a strong, stable server-only `STREAM_SECRET` before production. All
media and probe links use the existing signed first-party proxy.

- Opening a match/channel probes available signed media sources, ranks live
  sources using recent success rate, startup latency and FHD/HD quality, and
  starts the best candidate. Reliability/speed outweigh resolution. Existing
  match-specific sources take priority over unrelated, disclosed backups.
- Each mounted player refreshes health every **30 seconds** while visible.
  The bounded server probe has a **3.5-second** timeout, a **30-second** cache,
  inflight deduplication, a five-sample stability window and safe redirects.
  HTML/404/410 are offline; CDN blocking, transport errors and ambiguous
  responses remain Standby/unknown, not proof of a dead stream.
- **POST `/api/stream-health`** accepts `{ "urls": ["/api/proxy?…"] }`, at
  most 12 unexpired, signed, safe-upstream links per request. Results contain
  status, `latencyMs`, `checkedAt` (epoch milliseconds), `successRate` (0–1)
  and `samples`. It rejects forged links, cross-origin browser requests and
  oversized batches. Probes measure **server-side reachability/startup**, not
  viewer bandwidth, segment continuity or content rights.
- Fatal playback errors, no first frame, stalls and confirmed-offline probes
  trigger ranked failover. Healthy playback is not interrupted just because
  another source's latency improves. Manual selection and the Auto-switch
  preference remain available, along with existing automatic retry/backoff.
- Fixture matching normalizes aliases, accents, common typos, Arabic names,
  M3U `tvg-name`/`tvg-id`, tags and JSON fixture metadata. Both distinct teams
  must match; women's/youth/reserve mismatches and ambiguous same-city teams
  are rejected. It does not execute feed text as arbitrary regular expressions.
- **GET `/api/channels/[id]/streams`** resolves signed, health-ranked channel
  sources for both the channel page and Multi-View. The response never exposes
  raw playlist entries.
- `/multistream` provides four independent match/IPTV slots, searchable source
  selection, replacement/removal, width sliders/drag handles, quad reset,
  catalog refresh and channel deep links (`?channel=<channel-id>`). A picker
  portal covers sticky/mobile chrome and supports focus containment, keyboard
  tabs, Escape dismissal and focus restoration.
- Direct IPTV streams start **muted** to satisfy autoplay policies. Use each
  player's audio control; **Mute all** does not restart decoders. Embedded
  provider players control their own audio. Four concurrent decoders can use
  substantial bandwidth/CPU, and actual playback depends on upstream access.

### Official IPTV-Org sports integration

The default feeds now include **`https://iptv-org.github.io/iptv/categories/sports.m3u`**
as well as the existing Live-events index. No API key is required. An explicit
`LIVE_FEED_URLS` list **replaces** defaults; remove an older one-feed override or
append the official URL to enable both. `LIVE_FEED_URLS=''` disables feeds.

- Pages/raw transport failures retry the identical published file through
  `https://api.github.com/repos/iptv-org/iptv/contents/categories/sports.m3u?ref=gh-pages`.
  The branch is **gh-pages**, not master/main. This API URL may also be configured
  directly. Public GitHub rate limits still apply; no credentials are sent.
- Extended M3U parsing supports CRLF/BOM, quoted commas, single/double/unquoted
  attributes, `EXTGRP`, semicolon group tags, TVG identifiers/names and bounded
  Referer hints. Logos keep their original full-resolution URLs/SVG/query
  parameters. Numeric title resolution takes precedence over vague labels and
  database suffixes: 1080p beats `@SD`, while `HD (360p)` remains SD even if the
  TVG identifier says `@HD`. Quality is a feed hint, **not a measured decoding resolution**.
- Extensionless official HTTP(S) media endpoints are retained as candidates.
  Unsafe/non-HTTP URLs, promotional items and duplicates are rejected. The
  five-MiB feed cap is enforced while reading; API base64 responses are bounded.
- Feed caching is keyed by configured sources. Loads are coalesced within a
  process; partial refresh failures retain the failed source's last-known list.
  Stale entries are never assumed healthy: automatic injection still probes them.
- Two distinct team aliases/typos are required for `coverage: 'fixture'`.
  Actual ESPN `broadcasts`/`geoBroadcasts` TV metadata and explicit title hints
  are matched against network aliases/regexes; no broadcast rights are inferred
  from a team's league. Numbered channels and ESPN+/Deportes/Premium, beIN XTRA,
  Canal+ Sport, etc. are not silently conflated. Explicit other-game listings
  are excluded from the generic pool.
- Automatic selection checks **at most 24 candidates per pool**, pins the top
  twelve and rotates the remaining window every 30 seconds on subsequent
  resolutions. Identical concurrent pools share work. This is bounded discovery,
  not an exhaustive scan of every listed stream or a background cron job.
- Only a fresh `live` result with **`mediaVerified: true`** enters the official
  automatic pool (maximum three sources). Strong probes follow up to two HLS
  playlist levels and sample a segment (eight KiB per response) within the same
  3.5-second deadline. Bare playlist headers, HTML/JSON errors and inaccessible
  segments do not pass. DRM/key-dependent playlists remain unverified; no
  licensing, key retrieval or regional restriction bypass is attempted.
- The URL+Referer health cache reuses strong results for player ranking and
  continues segment checks on 30-second player polls while its ten-minute
  strong-probe history is retained. Up to five observations measure recent
  reliability; a single success is not a sustained-playback guarantee. Latency
  includes manifest/segment startup from the application server.
- `coverage: 'broadcaster' | 'sports'` uses an `iptv-org-fallback-*` provider,
  preserves the network name, displays the existing different-fixture warning,
  and ranks behind viable fixture-specific sources. Working broadcaster hints
  beat unrelated sports channels; speed/reliability outweigh resolution within
  a coverage tier. Upcoming/finished fixtures do not get generic automatic backups.
- `/api/streams/[matchId]` shares this provider with the normal match player and
  Multi-View. `/api/channels/[id]/streams` uses the same stronger verification
  for automatically added official channel alternatives. A manually selected
  channel can still be attempted when blocked/unknown, without adding unknown
  siblings or removing it from the catalog.

A public playlist entry does not establish viewing rights or prove which game
is currently on a network. These checks verify startup media availability, not
viewer bandwidth, codec/DRM compatibility or continuous playback. Use reachable,
authorized sources and respect upstream terms and regional restrictions.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The regression suite covers callback exchange/error/handoff security,
StrictMode and implicit returns, resend, ESPN contracts/partial data/identity
fallbacks, linked squad cards, trophy filters, source metadata/matching,
health caching/security/ranking, four mounted independent players, mute-all,
source replacement/unmount cancellation, official Pages/API fallback and bounded
M3U parsing, broadcaster number/edition guards, segment-gated injection, rotating
probe discovery, and automatic HLS/health failover.

Before deploying, send a real signup email on the configured Supabase project
and test confirmation, reused/expired links, same-browser PKCE and a second
browser with the token-hash template. Check live playback against reachable,
authorized sources on desktop/mobile. An isolated network-restricted preview
cannot verify delivery of real email or the availability of external streams.

Network-restricted preview environments may need Node's installed system CA
store (`NODE_USE_SYSTEM_CA=1`) to trust their managed outbound proxy. Keep TLS
verification enabled; never use `NODE_TLS_REJECT_UNAUTHORIZED=0`. External media
origins must still be reachable from the deployment.
