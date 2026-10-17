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
