# ⚽ EVIV Live — Real-Time Football Scores & Live Streams

**EVIV Live** is a high-performance live football hub built on **Next.js 16** with **React 19**, **Tailwind CSS v4** and a **Deep Burgundy / Electric Lime** brand system. It shows every real fixture of the day — past, live and upcoming — with genuine live statistics, then resolves multi-server streams on the fly.

**No mock data, ever.** Fixtures, scores, match minutes, cards, scorers and statistics are read straight from ESPN's public scoreboard JSON. Streaming sources are aggregated from public feeds/providers and always played through a signed first-party proxy.

> **Brand:** page `#18030A` · cards `#280713` · borders `#3D0B1D` · neon lime `#C6FF00`. Dark is the default; light is an explicit opt-in.
> **Mark:** the EVIV Live eagle, wordmark and animated on-air signal are one responsive SVG lockup.

---

## 🌟 Key Features

* 🛰️ **REAL Data Only (ESPN public API)**: the home dashboard consumes `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard` for every competition of the day — live, finished and upcoming — plus per-match summaries for statistics and play-by-play. Nothing is fabricated: a match is only marked live when ESPN reports `status.type.state === "in"`, and unparseable values are omitted rather than invented.
* ⚽ **Live Match Statistics on the Cards**: live cards show the real score, the real match minute (`62'`, `HT`, `90'+3'`), yellow/red card chips and the goal scorers — grouped per player and listed directly under their own team (`Bukayo Saka 20', 55'`). Each card then polls `/api/match/{id}` every 30 s to stay current.
* 🧾 **Match-Centre Scoreboard**: Home (crest, name, score, scorers, cards) and Away sit in separate columns on every screen size — never stacked — with a centre divider showing the live minute (with DVR controls), the period (`1st half`, `Half-time`, `Extra time`, `Full time`) and the competition chip. Scorers are grouped per player with goal icons and minutes (`Alphadjo Cissè 15', 32'`), penalties `(P)` and own goals `(OG)`, anchored strictly under the team they scored for.
* 💧 **Liquid-Glass Crests**: club crests float inside a glossy "water droplet" (`components/clubs/CrestDrop.jsx` + `.crest-drop` in `globals.css`): frosted translucent backdrop, radial caustic glow tinted with the club colour, curved specular highlight, glint, inner rim light and layered shadows — on match cards, the scoreboard, the predictor, favourites and club pages.
* 🌑 **Dark Glass Match Centre**: the scoreboard, the "Who will win?" predictor, H2H insights and the player chrome use theme-independent dark glass (`.glass-dark`), so labels, badges and stats always sit on a dark backdrop with high contrast (secondary text is `zinc-300/400`, never the sub-AA `zinc-500+` on burgundy).
* 👤 **Fan Accounts & Profile (`/profile`)**: Guest vs registered fans, via **Supabase Auth** when configured or secure **device-local accounts** (PBKDF2-SHA256 hashed passwords) otherwise. Fans edit their display name, avatar (upload — downscaled in the browser — or a brand preset) and primary favourite club. Registered fans get the brand **verified badge** (blue rosette, lime ring) on their profile, in the header and next to their chat messages. A **Fan Stats** card shows prediction accuracy (correct calls over settled votes, streaks, recent calls), starred teams and chat activity.
* 🗂️ **Live / Upcoming / Finished Tabs**: past, live and upcoming fixtures of the day in one dashboard, with tournament filters, multi-select search, favourite-team pinning and kickoff countdowns.
* 📊 **Enterprise Match Statistics**: real boxscore comparison rows (possession, shots, corners, fouls, cards …) with proportional bars — lime for home, sky for away — next to the real key-events log on the match page.
* 📡 **Channels That Never Disappear**: `/channels` server-renders the currently published `playlist.m3u`, falling back to GitHub’s base64 Contents API if raw access is blocked/HTML. It shows all statuses by default; CDN-blocked probes are **Standby**. Clicking a channel attempts playback through the signed `/api/proxy` player even if a probe failed.
* 🎨 **Burgundy & Lime Design System**: Tailwind v4 `@theme` tokens (legacy `navy-*` utility names now map to burgundy shades; `lime-*` maps to the new electric lime) drive every surface, button, active state and player control. Cards and live badges animate, respecting `prefers-reduced-motion`.
* 📺 **Interactive Stream Player**: auto-detects direct stream formats (HLS/m3u8/mp4) and uses `hls.js` for native low-latency playback. Provider embeds run in an **unsandboxed** iframe with a permissive `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"` list — provider players refuse to play inside `sandbox` ("Remove sandbox attributes on the iframe tag").
* 🔀 **Server Selector & Automatic Failover**: every source becomes a server (Server 1, Server 2, …, Backup) with automatic failover on fatal errors, no-first-frame and stalls. Embeds are watched too: a refused/expired signed link inside the frame and provider pages the server-side probe (`/api/stream-redirect?…&check=1`) reports gone fail over immediately, and after an embed fails the **direct HLS/MP4 backups are tried first**. Viewers can tap **Next server** when a provider shows its own error. Once every server failed, the player re-signs links and **retries the whole list on its own** (10 s → 30 s → 60 s, with a countdown and Cancel), plus a manual **Retry all**.
* 🧠 **Health-Aware IPTV**: official IPTV-Org sports feed, two-team/broadcaster mapping, media-verified automatic backups and FHD/HD speed/stability ranking shared by the match player and Multi-View. Latency is measured from the server, not the viewer.
* 🖥️ **Multistream Arena**: up to four independent live matches or IPTV channels in a responsive, resizable grid. Search, replace/remove sources, control per-tile audio and mute all without restarting streams.
* 🏅 **Player Showcases (`/player/[id]`)**: full-card squad links, age/position/nationality banner, linked club crest, dated valuation, five season metrics and a glass Trophy Cabinet (الفيترينة) with individual/team filters and expandable honors. Missing provider statistics stay explicit; selected editorial honors/valuations are historical and sourced.
* 🏆 **Standings, Top Scorers & Top Assists**: `/standings` has a scrollable league pill selector (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Botola Pro, Europa League, Eredivisie, Primeira Liga, Saudi Pro League, MLS) and Table / Top Scorers / Top Assists tabs. Tables show Pos, Team, P, W, D, L, GF, GA, GD, Pts with qualification/relegation zones; phones get a combined `GF:GA` column so points never scroll off-screen. The league and tab live in the URL (`?league=esp.1&view=scorers`), so views can be shared.
* 🛡️ **Club Pages (`/club/[id]`)**: every crest and club name (match cards, scoreboard, standings, leaderboards, fixtures) links to a club page. It has a hero in the official club colours with a high-res crest, plus founding year, stadium and current manager. Below that come the Wikipedia history/bio and tabs for **Form & Results**, **Fixtures** and **Squad**. ESPN data renders first; the Wikidata facts and bio stream in afterwards.
* 💬 **Live Chat & One-Tap Predictions**: the chat input is never disabled. Messages appear instantly with delivery ticks and a one-tap retry, Enter sends, and focus stays in the field. Votes register on tap with a check-mark pop, ring pulse and chime; the tally updates immediately and a vote can be changed. Both sync through Supabase when it is configured. Without it they still work, stored in the browser and live-synced across tabs.
* 🔊 **Tactile Feedback**: tiny Web Audio sounds are synthesised in real time (no audio files): taps, tab switches, votes, sends and reactions. Phones also get matching haptic ticks. One switch in the header controls both, and the setting is saved.
* 📱 **Native-App Feel**: a mobile bottom tab bar (Matches · Live Channels · Standings · Multi-View) in Flutter/Material-3 style, safe-area aware, with the ad banner docked above it. Cards use `rounded-3xl` with layered depth, glass chrome and springy `active:scale` presses, and sticky in-page toolbars.
* 🌓 **Dark mode by default** (light mode remains optional), slow-network resilience (SWR caching, retry/recovery, skeletons) and an installable PWA with a branded offline fallback.

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2.6 | App Router, SSR, API routes |
| **React** | 19.2.6 | UI rendering |
| **Tailwind CSS** | 4.3.0 | Utility-first CSS with v4 `@theme` brand tokens |
| **TypeScript** | 6.0.3 | Typed library code (providers, probe, proxy) |
| **hls.js** | 1.7 | Client-side HLS playback (code-split) |
| **Lucide React** | 1.16.0 | Icon library |
| **Upstash Redis** | 1.38.0 | Optional distributed caching |
| **Vitest** | 5.0.4 | Unit + server-render component tests |
| **SWR** | 2.5.1 | Client-side standings fetching, league prefetch on hover |
| **Web Audio API** | — | Synthesised UI sounds (no audio assets) |

---

## 🧭 Real-Data Pipeline (ESPN)

```
ESPN scoreboard (all/scoreboard?dates=YYYYMMDD)        ← fixtures, scores, minutes, cards, venues
        │
        ├── lib/providers/espn.ts  → normalised `Match` (live | upcoming | finished)
        │        • status.type.state  → live / upcoming / finished (+ postponed → upcoming + note)
        │        • status clock/detail → "62'", "HT", "FT"      (period-aware fallback)
        │        • competitions[0].details → yellow/red cards, goals, own goals, penalties, scorers
        │        • season.slug → tournament name, country, priority (real upstream metadata)
        │
        ├── lib/streamEngine.ts    → merges catalogue stream servers onto the ESPN fixture
        │                            (fuzzy team matching; ESPN stays authoritative)
        │                         → offers up to 3 confirmed/standby feed channels as
        │                            unverified backups for unlinked live ESPN fixtures
        │
        └── summary / CDN game package → stats + play-by-play
                 • /soccer/all/summary?event=ID            (tried first)
                 • /soccer/{league}/summary?event=ID       (slug derived from the season slug)
                 • cdn.espn.com/core/soccer/game?xhr=1&gameId=ID   (league-agnostic fallback)
```

**Caching:** scoreboards 15 s upstream / 20 s in-app, summaries 45 s, feeds 5 min, probe results 90 s (in-memory SWR, or Upstash Redis when configured). The home page and `/api/matches` render dynamically so a visitor never sees a stale static snapshot.

### Standings & club data

```
/standings (?league=eng.1&view=table|scorers|assists)
   ├── ESPN  apis/v2/sports/soccer/{league}/standings        ← table, rank, zones (sorted by published rank)
   ├── ESPN  apis/site/v2/sports/soccer/{league}/statistics  ← goalsLeaders / assistsLeaders
   └── TheSportsDB lookuptable.php?l=4520                     ← Botola Pro (free tier: top of table only, flagged)

/club/{espnId}-{slug}   (or /club/{slug} → ESPN search resolves the id)
   ├── ESPN  all/teams/{id}                      ← name, colours, crest, league, standing, record
   ├── ESPN  all/teams/{id}/schedule[?fixture=true] ← results + fixtures across every competition
   ├── ESPN  {league}/teams/{id}/roster          ← squad (ESPN's stale `coach` field is ignored)
   ├── Wikipedia search + REST summary           ← history / bio (CC BY-SA attribution shown)
   └── Wikidata P571 / P115 / P286               ← founded, home venue, current head coach (no end date)
```

Standings are cached for 5 minutes, club core data for 10 minutes and Wikipedia/Wikidata facts for 24 hours. If a source is down, the page shows a retryable "temporarily unavailable" screen (HTTP 503 from the API), not a misleading 404.

---

## 🏗️ Architecture & Directory Structure

```
footylive/
├── app/
│   ├── api/
│   │   ├── matches            # Every real fixture of the day (live → upcoming → finished)
│   │   ├── match/[matchId]    # Live scoreboard polling: score, minute, cards, scorers, incidents
│   │   ├── streams/[matchId]  # Resolved servers with signed proxy URLs
│   │   ├── stream-redirect    # HMAC-validated redirect for iframe embeds
│   │   ├── proxy              # Signed HLS relay (playlist rewriting, Range/206, CORS)
│   │   ├── live-channels      # Feed channels + best-effort status (never hides a channel)
│   │   ├── standings          # League table + top scorers + top assists (?league=slug)
│   │   ├── club/[id]          # Club profile: ESPN core + Wikipedia/Wikidata facts
│   │   └── v1/                # 24h image proxies: league-logo, team-logo, poster
│   ├── api-hub/               # Developer docs: endpoints, real-data pipeline, upstream APIs
│   ├── channels/              # Server-rendered channel grid (all statuses shown)
│   ├── channel/[id]/          # Proxied playback for one channel + bounded status check
│   ├── watch/[matchId]/       # Live scoreboard, real stats, play-by-play, player + failover
│   ├── profile/               # Fan profile: sign in / sign up, edit profile, Fan Stats
│   ├── multistream/           # Up to 4 simultaneous players
│   ├── standings/             # League pills + Table / Top Scorers / Top Assists tabs
│   ├── club/[id]/             # Club hero, streamed facts + bio, Results / Fixtures / Squad tabs
│   ├── layout.js              # Responsive SVG lockup in the header/footer, dark mode default
│   ├── globals.css            # Tailwind v4 @theme: burgundy & lime palettes, glass, animations
│   └── page.js                # Home dashboard (dynamic, live data)
├── components/
│   ├── BrandLogo.jsx          # Responsive eagle + wordmark + on-air SVG lockup
│   ├── MatchCard.jsx          # Real live cards: minute, cards, scorers, FT state, lime pulse
│   ├── MatchGrid.jsx          # Live / Upcoming / Finished tabs, tournament shelf, search
│   ├── MatchStatsSection.jsx  # Real stat bars (lime home · sky away) + key-events log
│   ├── LiveScoreboard.jsx     # Burgundy/lime scoreboard, cards and scorers
│   ├── LiveChannelsGrid.jsx   # Channels with Live / Standby / Unreachable statuses
│   ├── StreamPlayer.jsx       # hls.js/native playback, unsandboxed embeds, failover + auto-retry
│   ├── ServerSelector.jsx     # Server 1 … Backup selector + in-player menu
│   ├── chat/MatchChatPanel.jsx      # Optimistic live chat (never-disabled input, retry, auto-scroll)
│   ├── predictions/VotingBar.jsx    # One-tap votes, instant tallies, confirmation animation
│   ├── standings/StandingsView.jsx  # Standings UI (sticky pills + segmented tabs)
│   ├── club/                  # ClubHero, ClubFacts (streamed), ClubTabs, FormStrip
│   ├── clubs/                 # ClubLink (→ /club/[id]), resilient TeamLogo, liquid-glass CrestDrop
│   ├── auth/                  # VerifiedBadge, UserAvatar, header AccountButton
│   ├── profile/               # ProfileDashboard, AuthPanel, ProfileEditor, ClubPicker, FanStatsCard
│   ├── nav/                   # MobileBottomNav (phones) + HeaderNav (active states)
│   └── ui/                    # SoundEffects (delegated tap sounds), SoundToggle, LocalDateTime
├── lib/
│   ├── providers/espn.ts      # ★ Real ESPN fixture/statistics provider (pure normalisers)
│   ├── providers/             # WatchFooty, CDNLive, StreamedPk, LiveFeed (stream sources)
│   ├── broadcast/             # Feed parsers, channel resolver, resilient probe
│   ├── cache/                 # In-memory SWR + optional Upstash Redis
│   ├── player/                # Server labels, stream-kind detection, failover machine, embed helpers
│   ├── streamRedirect.ts      # Signed embed links: HMAC sign/verify + provider page probe
│   ├── match/scoreboard.ts    # Scorer grouping per player/side, period + clock labels
│   ├── auth/                  # Fan auth: Supabase Auth (GoTrue REST) or local accounts, useAuth()
│   ├── fanStats.ts            # Prediction accuracy, streaks, chat activity, fan level
│   ├── utils/matching.ts      # Fuzzy team and league matching
│   ├── standings.ts           # League catalogue + ESPN / TheSportsDB table & leader normalisers
│   ├── providers/standingsProvider.ts # Cached standings bundles
│   ├── clubs/                 # Club links, ESPN team/schedule/roster normalisers, Wikipedia/Wikidata, colours
│   ├── supabase/client.ts     # Supabase-compatible client: PostgREST (remote) or localStorage + BroadcastChannel (local)
│   ├── sound/uiSound.ts       # Web Audio synth + haptics with a persisted mute switch
│   └── streamEngine.ts        # Merges real fixtures with stream sources; HMAC URL signing
└── public/                    # manifest.json, icon.svg (eagle), offline.html, sw.js
```

---

## 🚀 How to Run Locally

### Prerequisites
* **Node.js** v18.17.0 or higher
* **npm** v9+

### 1. Installation
```bash
git clone https://github.com/daftarlayl2-creator/footyLive.git
cd footyLive
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Cryptographic stream key (signs player links and proxy URLs via HMAC)
STREAM_SECRET="default_stream_hmac_secret_key_123_abc"

# Optional: catalogue provider base URL (stream sources; defaults to https://api.watchfooty.st)
# NEXT_PUBLIC_API_BASE="https://api.watchfooty.st"

# Optional: comma-separated M3U/JSON live feeds. Unset enables Live-events + IPTV-Org sports.
# An explicit list replaces defaults; an empty string disables all live feeds.
# LIVE_FEED_URLS="https://raw.githubusercontent.com/ibstvofficial/Live-events/main/playlist.m3u,https://iptv-org.github.io/iptv/categories/sports.m3u"

# Optional: cached image proxy base (defaults to the catalogue provider)
# Optional: let /api/proxy reach LAN/loopback origins (local testing only)
# HLS_PROXY_ALLOW_PRIVATE_HOSTS=true

# Optional: Redis caching (Upstash) — falls back to in-memory caching when omitted
# UPSTASH_REDIS_REST_URL=""
# UPSTASH_REDIS_REST_TOKEN=""

# Optional: shared live chat + predictions (Supabase). Without these, chat and votes still
# work but are stored in each visitor's browser (synced live across that browser's tabs).
# NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
# NEXT_PUBLIC_SUPABASE_ANON_KEY=""
```

<details>
<summary>Supabase tables for chat & predictions</summary>

```sql
create table match_messages (
  id uuid primary key,
  match_id text not null,
  username text not null,
  avatar text,
  message text not null check (char_length(message) <= 280),
  created_at timestamptz not null default now()
);
create index on match_messages (match_id, created_at);

create table match_predictions (
  id uuid primary key,              -- one row per device/vote; updated when the vote changes
  match_id text not null,
  username text,
  prediction text not null check (prediction in ('home', 'draw', 'away')),
  created_at timestamptz not null default now()
);
create index on match_predictions (match_id);

alter table match_messages enable row level security;
alter table match_predictions enable row level security;
create policy "read chat" on match_messages for select using (true);
create policy "post chat" on match_messages for insert with check (true);
create policy "read votes" on match_predictions for select using (true);
create policy "cast votes" on match_predictions for insert with check (true);
create policy "change votes" on match_predictions for update using (true);

-- Fan accounts (Supabase Auth): verified chat messages + avatars.
alter table match_messages add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table match_messages add column if not exists verified boolean not null default false;
drop policy if exists "post chat" on match_messages;
create policy "post chat" on match_messages for insert
  with check ((user_id is null and verified = false) or user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```

Fan accounts use the same two env vars: sign-up / sign-in / token refresh go to Supabase Auth's REST API (no SDK), the session persists in `localStorage` and is refreshed a minute before it expires, and the PostgREST client sends the user's access token so row-level security sees `auth.uid()`. Display name, favourite club and avatar URL live in `user_metadata`; uploaded pictures go to the public `avatars` bucket (only the URL is stored — a device copy is kept if the upload is unavailable). Accounts count as verified once the email is confirmed. Chat inserts fall back to the classic row shape if the table predates the `user_id` / `verified` columns. Without Supabase, accounts live on the device with PBKDF2-SHA256 hashed passwords.

The client talks to PostgREST directly (no SDK in the bundle). New chat messages arrive by polling for new rows every 4 s while the tab is visible, and vote tallies refresh every 20 s. If the shared backend is unreachable, both widgets fall back to the browser store instead of failing.
</details>

> The default feed is `playlist.m3u`; `live.m3u8` currently returns 404 in that repository.
> When a GitHub raw fetch fails or returns HTML, the matching Contents API file is base64-decoded.
> If an explicitly configured `live.m3u8` is missing, `playlist.m3u` is tried as an alternate.
> ESPN's public endpoints need no key. If your network blocks them, today's fixtures will be empty
> (the dashboard says so and retries automatically) — nothing is replaced with placeholder data.

### 3. Running in Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Build and Production Run
```bash
npm run build
npm run start
```
Cloudflare Workers build: `npm run build:cloudflare`.

Linting runs the ESLint CLI against `eslint.config.mjs` (`next lint` was removed in Next.js 16):
```bash
npm run lint
```

### 5. Running Tests
```bash
npm run test
```
The suite runs on Vitest 5 (Vitest 4.1 crashes npm's dependency resolver — see `package.json`).
It covers the ESPN normalisers (live/upcoming/finished, minutes, cards, scorers, stats),
GitHub raw-to-Contents fallback, the signed and transparently labelled live-channel backups,
the channel probe policy (blocked → Standby, 404 → offline, HEAD-blocked → GET retry), the proxy
signing, the failover machine and server-rendered brand/live UI assertions. It also covers the
standings/leaders normalisers and the club normalisers (team, schedule, roster, search,
Wikipedia/Wikidata), all against fixtures captured from the live APIs in `lib/providers/__fixtures__/`.
Further suites cover the Supabase-compatible client (chained queries, local realtime, cross-tab
BroadcastChannel delivery, PostgREST URLs and polling), the Web Audio sound engine, vote and chat
helpers, and the server-rendered overhaul UI (club links, tab bar, chat, voting, standings, club page).
The glass sprint adds suites for embed helpers and signed-redirect probing, the embed-aware failover
(viewer reports, direct-backup preference, auto-retry backoff), scorer grouping and period labels,
fan auth (password hashing, local accounts, the GoTrue client, session refresh/sign-out), fan stats,
and mounted UI tests: unsandboxed player frames with refused-link failover and the auto-retry
countdown, the two-column scoreboard, dark-glass predictor, liquid-glass crests, the sign-up →
verified profile flow, prediction accuracy and verified chat messages.

---

## 🛠️ Developer REST API Directory

Interactive documentation lives at [`/api-hub`](https://eviv.si/api-hub).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/matches` | GET | ESPN fixtures enriched with catalogue servers or best-effort live-feed preview counts |
| `/api/match/[matchId]` | GET | Live score, minute, cards, scorers and incidents for one match |
| `/api/streams/[matchId]` | GET | Match-specific streams plus (live ESPN only) signed, unverified channel backups |
| `/api/stream-redirect` | GET | HMAC-validated redirect to upstream embed URLs; `&check=1` returns a server-side probe of the provider page (`ok` / `offline` / `unknown`) |
| `/api/proxy` | GET | Signed HLS relay: playlists rewritten server-side, segments streamed, `Range`/`206`/CORS preserved |
| `/api/channels/[id]/streams` | GET | Signed, health-ranked source alternatives for a channel and Multi-View |
| `/api/stream-health` | POST | Probe up to 12 valid signed media links; server latency, reachability and recent success rate |
| `/auth/callback`, `/auth/confirm` | GET | Verify email token hashes or exchange PKCE codes; redirect to profile with an informative result |
| `/auth/session` | POST | Same-origin, one-time HttpOnly auth handoff to the browser session |
| `/api/live-channels` | GET | Feed channels + best-effort status (`live`, `unknown` → “Standby”, `offline`); never hides channels |
| `/api/standings?league={slug}` | GET | League table (zones, ranks), top scorers and top assists; `mar.1` (Botola Pro) via TheSportsDB |
| `/api/club/[id]` | GET | Club profile (`359`, `359-arsenal` or `real-madrid`): colours, standing, results, fixtures, squad, form + Wikipedia/Wikidata facts |
| `/api/v1/league-logo/[id]` | GET | Cached league logo proxy (24h) |
| `/api/v1/team-logo/[id]` | GET | Cached team badge proxy (24h) |
| `/api/v1/poster/[id]` | GET | Cached match poster proxy (24h) |

### Channel status semantics

| Status | Meaning | UI |
|--------|---------|-----|
| `live` | Probe fetched a real playlist/media response | Lime pulsing **Live** pill |
| `unknown` | Probe blocked (403/405/429/5xx), timed out, or unreadable body | Neutral **Standby** pill — still playable |
| `offline` | Upstream answered 404/410 or served an HTML page | **Unreachable** pill — skipped by automatic source selection; manual controls remain available |
| `checking` | Probe still running | Amber **Checking** pill |

Every channel links to `/channel/{id}`, which resolves signed, health-ranked `/api/proxy` sources without removing the channel from the catalog.

**Official sports integration:** `https://iptv-org.github.io/iptv/categories/sports.m3u` is loaded dynamically by default alongside Live-events. If Pages is unavailable, the same file is fetched through GitHub's Contents API from the published **`gh-pages`** branch. Original high-resolution logos, groups, TVG identifiers and quality metadata are retained; the feed cache refreshes every ten minutes.

For live fixtures, up to three **media-verified IPTV-Org sources** are automatically added to the match player and match tiles in Multi-View. Both-team fuzzy evidence takes priority, followed by actual broadcaster hints (beIN, ESPN, Canal+, etc.), then generic sports backups. Explicit network numbers/editions are respected. A bounded probe follows HLS variants and samples a real media segment; blocked, stale, offline, manifest-only or protected/key-dependent sources are not auto-injected. Rechecks use a 30-second cache and five-sample reliability history, preferring fast stable FHD/HD. A rotating probe window explores beyond dead front-of-list channels.

**Reachability is not fixture coverage.** Network/general backups remain explicitly marked as possibly showing a different fixture and cannot displace a viable fixture-specific source. Legacy Live-events fallbacks retain their existing live-first/standby-next behavior (at most three, live ESPN fixtures only; known-offline sources excluded). Manually selected channels remain available even when a probe is blocked; only verified official siblings are auto-added as alternatives. See [integration and verification details](docs/feature-expansion.md#official-iptv-org-sports-integration).

---

## 🤝 Open Source Community Guidelines

1. **Fork** the repository and create your feature branch: `git checkout -b feature/amazing-feature`.
2. Commit with clean messages: `git commit -m 'Add support for custom video players'`.
3. Push to the branch: `git push origin feature/amazing-feature`.
4. Open a **Pull Request** explaining your changes.

### Coding Standards
* **Real data first**: never introduce mock fixtures, placeholder scores or fabricated minutes. Missing upstream values are omitted, not invented.
* **Brand palette**: use the burgundy-alias `navy-*` / electric `lime-*` tokens from `@theme`. Pair neon lime with `text-navy-950` for contrast.
* **Responsive Design**: every component must work on mobile, tablet and ultrawide screens.
* **Player embeds vs ads**: never add `sandbox` to video-player iframes (providers refuse to play); use `EMBED_IFRAME_ALLOW` from `lib/player/embed.ts`. Ad frames (`components/ads/AdSlot.jsx`) stay sandboxed.
* **Dark glass & contrast**: match-centre surfaces use `.glass-dark` / `.glass-dark-tile`; on dark backgrounds keep secondary text at `zinc-300`/`zinc-400` or lighter. Crests go through `CrestDrop`.
* **Tests**: normalisers and probe policy changes come with `vitest` cases (`npm run test`).
* **Tactile UI**: use `tactile` / `tactile-soft` for pressable surfaces, `app-card` for elevated cards, and `role="tab"` for tab controls (they get the tab sound automatically). Use `data-sound="none"` to silence a region, or `data-sound="vote"` (etc.) to pick a specific sound.
* **Club links**: render team names and crests through `components/clubs/ClubLink.jsx` so they always point to `/club/[id]`.

---

## ⚖️ License & Disclaimer

EVIV Live is an open-source aggregator. It reads public sports data and public third-party link networks
for research and educational purposes. EVIV Live does not host, upload or own any media streams, video
channels or sports network content.

## Match-day feature expansion

- **Retro goal audio:** Open the speaker icon in the header for Sound settings.
  Interface sounds/haptics and retro goal alerts have independent switches;
  **Test goal sound** previews the latter. The effect is an original Web Audio
  formant/vowel synthesis with a crowd swell and a broadcast-style stinger, not
  a licensed commentator recording. Alerts follow positive live score changes
  for starred teams on the fixtures page and for the actively viewed match.
  Initial scores, unchanged polls, missing scores and downward VAR corrections
  do not trigger a sound. Dashboard/card observers deduplicate the same goal.
  Browsers require a user gesture before audio can play; blocked goals are not
  queued to play later. Monitoring runs while the page is open, not as a
  background push service. Desktop notifications remain separately opt-in.
- **H2H & AI Win Probability:** Available on `/watch/[matchId]` and the new
  `/match/[id]` alias. A separate, non-blocking insights request combines the
  last five results (55%), current official league points (30%, normalised per
  game when possible) and up to ten available prior meetings (15%), with a
  modest home advantage and a draw baseline. Missing factors are omitted and
  weights rebalanced. This is a transparent lightweight statistical heuristic,
  **not a trained AI, calibrated betting odds or live-score odds**. Coverage
  chips, factual quick insights, loading/retry and insufficient-data states
  keep missing upstream data explicit. Both schedules exclude the current
  fixture and later results; league points reflect the current table.
- **Favorites hub:** A sticky, horizontally scrollable shelf above the matches
  content shows starred club crests. Tap a crest to open its club profile,
  results and fixtures; tap **Add Favorite Teams** to choose from the day's
  clubs. Team stars on match cards also update the hub. Legacy `fav_teams`
  name lists remain supported; new favorites store crest/id metadata beside
  that list in `fav_team_details`, so the hub survives days without fixtures.
  Changes sync within the page and across browser tabs. Crests request retina
  resolution where supported and fall back to club initials.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
The feature tests cover real mounted score polling, notification-independent
sound, duplicate suppression, preference persistence, favorites interactions,
H2H orientation/de-duplication, probability totals and provider outages.


## Confirmation, showcase & smart IPTV expansion

Implementation and deployment details: [feature expansion guide](docs/feature-expansion.md).

- Supabase email links now have `/auth/callback` and `/auth/confirm` routes,
  PKCE/token-hash exchange, a same-origin session handoff, and clear recovery
  banners instead of callback 404s. **Configure your public callback URL in
  Supabase's redirect allowlist**; the guide also provides a cross-device
  email template and preview-host instructions.
- Every squad card opens a dedicated showcase with player/club context,
  current or clearly labelled historical metrics, and interactive trophy
  shelves. ESPN identity and competition splits are joined rather than
  assuming the overview response contains a player object.
- The shared smart player powers the watch page, channel pages and all four
  Multi-View screens, with health/latency/stability ranking, guarded auto-switch
  and independent decoder cleanup. Standby probes do not disable playback.

Verification commands remain `npm run typecheck`, `npm run lint`, `npm test`
and `npm run build`. New mounted regressions cover email returns, showcases,
four independent IPTV streams, mute-all, and automatic failover. Real email
and external-stream checks require configured Supabase and reachable providers.
