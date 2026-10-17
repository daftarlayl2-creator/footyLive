# Limon Live — Engineering Log

Baseline (2026-10-17, before this sprint): Next.js 16 App Router + React 19,
Vitest 5. `npm run test` 112 files / 993 passed; `typecheck`, `lint`, `build`
all green. No match database (provider fetch + cache only); optional Upstash
Redis + Supabase not configured in this environment.

## Phase 1 — Match-data repairs (commit 0d51e60)

Deterministic record precedence (`lib/match/merge.ts`), authoritative-only
WatchFooty statuses (no wall-clock live inference), explicit epoch-unit
timestamps, shared visibility rules (`lib/match/visible.ts`), Redis SWR
single-flight refresh, highlights `18:00` separator fix. 1034 tests green.
Plus brand identity commit `5b0e6f4`.

## Phase 2 — Temporarily hide Live TV

- Central flag `lib/config/features.ts` (`NEXT_PUBLIC_LIVE_TV_ENABLED`,
  default hidden; exact `true` re-enables). Gated: header/mobile nav,
  `/channels` (honest unavailable state), `/channel/[id]` (404),
  `/api/live-channels` (empty + `disabled:true`), `/api/channels/[id]/streams`
  (404), sitemap, watch-page channel picker, stream-engine feed previews,
  feed-family providers and channel backup injection. Match-specific
  catalogue servers unaffected.
- Removed the hardcoded 3-channel standby stub from `getLiveChannels`
  listing logic (definitions retained, unused; empty list is honest).
- Tests: flag predicate, engine flag-off/on resolution, feeds fallback now
  expects `[]`, watch hub hidden state. Existing TV suites stub the flag on.


## Phase 3 — Dynamic IPTV playlist engine

- Discovery: `daftarlayl2-creator/iptv` is an iptv-org-style fork; 326
  `streams/{cc}.m3u` files on `master` (no group-title/logos in source
  files; generated category playlists in PLAYLISTS.md point upstream).
- `lib/iptv/catalog.ts`: allowlisted fetches (owner repo only, HTTPS,
  timeouts, 10MB cap, no redirects), reuses tolerant `parseM3U`, stable
  ids, per-source failure isolation, SWR cache (TTL env, default 900s),
  last-known-good served `stale:true`, never fabricated. Defaults:
  ma,dz,tn,eg,sa,ae,qa,fr,es,uk (env `IPTV_COUNTRIES`/`IPTV_PLAYLIST_URLS`).
- UI `/live-channels` + playback `/iptv/[id]` (existing StreamPlayer +
  signed proxy) + `/api/iptv/catalog`; all behind the Phase 2 flag.
  Search (accent-folded, typo-tolerant), category/region filters,
  device-local favorites, paged rendering, empty/error states.
- Verified against real cloned repo files: ma 14 / fr 223 / es 277 /
  uk 227 entries parse; playback itself not verifiable in this sandbox
  (egress allowlist; streams are third-party and rights vary).

## Phase 4 — Lineups & tactical pitch
Audit: `lib/lineups/formations.ts` geometry is rigorous (0–100 viewBox, `preserveAspectRatio="meet"`, shared row y-values, symmetric x spread, jersey label truncation + `aria-label` full names) and fully tested — kept as-is. Defect found upstream of it: when ESPN published no roster, the watch page passed `players: undefined` and the pitch rendered 11 placeholder shirts in an assumed 4-3-3 — a fabricated lineup.
- `components/lineups/PitchVisualization.jsx`: no verified players ⇒ explicit "Lineup not available" state (`data-lineup-unavailable`); new `formationKnown` prop — unpublished formation renders "Formation not published" instead of the layout default.
- `components/MatchStatsSection.jsx`: `extractTeamLineup` returns the upstream formation only (`null` when absent); layout fallback kept internal, never labelled as fact.
- Tests: +2 (unavailable state, unpublished-formation label); 9/9 pitch tests pass.
- No trade dress copied: geometry is the repo's own original model; no predicted XIs exist anywhere in the app (grep-verified).
- Phase 4 verification details consolidated in the final report; browser pixel checks at 1275px etc. unavailable here (no browser) — geometry covered by unit tests.

## Phase 5 — Live sports ticker
No ticker existed. Added:
- `lib/ticker/tickerItems.ts`: pure builder from canonical Matches — live entries only from upstream live status, verified finals <24h, today's fixtures (kickoff times, never scored); deduped, capped at 20; colon/time strings never parsed as scores. No news headlines (no verified news feed configured) — the strip says "No verified live scores or results to show right now" rather than inventing content.
- `components/ticker/SportsTicker.jsx`: mounted in layout under the header; fixed 36px strip (no layout shift); polls `/api/matches` every 60s and keeps last-good items on failure; CSS marquee (`tickerScroll`) paused on hover and via an accessible pause/resume button; `motion-safe` only (reduced-motion users get a static strip); duplicated loop content marked `aria-hidden`/`tabIndex=-1`.
- 4 unit tests pass; typecheck + lint clean.

## Phase 1 §D (completed with Phase 5) — targeted match refresh
`components/MatchGrid.jsx` no longer calls `router.refresh()` every 20s. Server props seed first paint; a 30s poll of `/api/matches` (skipped while the tab is hidden, keeps last verified list on failure) drives the grid, goal audio, and FavoritesHub. Scroll/filters/modal state survive updates.

## Phase 6 — Ads (partial; storage-blocked portion documented)
Existing monetisation is the Adsterra network (keys verbatim in `lib/adsConfig.js`, never edited) + first-party house partners (`lib/ads/partners.ts`). Impressions/clicks are already counted per slot by `AdSlot` → `lib/admin/metrics.ts` (durable only when Upstash is configured).
Done:
- Footer leaderboard placement added (`footerLeaderboard`/`footerMobile` in `AD_PLACEMENTS`, rendered in layout, VIP-hidden via `AdSlot`).
- `AdSlot` accepts an analytics `slot` override so placements sharing one network unit count impressions separately (footer no longer inflates the home-top slot's numbers).
- Hero slot (TopSportsBanner) and the large slot between the new ticker and FavoritesHub (homeTop desktop/mobile) already exist on the homepage — verified, kept.
- `lib/ads/creativeValidation.ts`: magic-byte-only PNG/JPEG/WEBP validation (2 MiB cap; SVG/HTML/GIF rejected) + 3 tests — ready for any future upload UI.
BLOCKED (needs owner decision, not implemented): first-party campaign CRUD, creative upload storage, schedules, impression targets. There is no durable object/table store in this environment (no Supabase credentials, no Upstash token), and inventing an in-memory "campaign manager" would fabricate capabilities that vanish on restart. Recommended: Supabase Storage bucket `ad-creatives` + `ad_campaigns` table behind existing admin RBAC; `validateCreative` plugs into the upload route unchanged.

## Phase 7 — Match chat
Audit: rooms already keyed by stable match id, stable hash hues (`hueFor`), sanitizers, optimistic delivery states, Supabase-or-local store reuse, verified/VIP badges — all kept. Gaps closed:
- Collapsed by default: header chevron toggle (`aria-expanded`), body mounts only when open, `h-[460px]` only while open.
- Room lifecycle: `chatRoomState()` in `lib/chat.ts` — open before/during and for 24h after full-time, read-only afterwards (composer replaced by an explanatory note; `send()` hard-guarded; history still readable). Watch page passes `matchStatus`/`matchTimestamp`.
- New `lib/chat.test.ts` (4 tests: lifecycle boundaries, fail-open on missing timestamps, hue stability, sanitizers).
- Server-side note: writes go client→Supabase (RLS) or to the local store; RLS policies cannot be verified from this sandbox and were not invented here.

## Phase 8 — Highlights resilience
Existing safeguards (verified, kept): 3s-bounded provider + client fetch that degrades to an honest empty state, thumbnail fallback ladder on cards, official "Open on YouTube" link, sandboxed-frame hygiene. Gap closed in `components/HighlightPlayerModal.jsx`: the embed now reports `onLoad`/`onError`, and a 6s patience deadline detects frames that never become ready (region/embedding restrictions render inside the frame and are unreadable cross-origin). On failure/slowness the modal shows `data-highlight-fallback` pointing to the official watch page — no proxying, re-hosting, or restriction circumvention. State is keyed by video id (no reset effects).
