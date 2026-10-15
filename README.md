# ⚽ EVIV Live — Real-Time Football Scores & Live Streams

**EVIV Live** is a high-performance, ad-free live football hub built on **Next.js 16** with **React 19**, **Tailwind CSS v4** and a **Deep Burgundy / Electric Lime** brand system. It shows every real fixture of the day — past, live and upcoming — with genuine live statistics, then resolves multi-server streams on the fly.

**No mock data, ever.** Fixtures, scores, match minutes, cards, scorers and statistics are read straight from ESPN's public scoreboard JSON. Streaming sources are aggregated from public feeds/providers and always played through a signed first-party proxy.

> **Brand:** page `#18030A` · cards `#280713` · borders `#3D0B1D` · neon lime `#C6FF00`. Dark is the default; light is an explicit opt-in.
> **Mark:** the EVIV Live eagle, wordmark and animated on-air signal are one responsive SVG lockup.

---

## 🌟 Key Features

* 🛰️ **REAL Data Only (ESPN public API)**: the home dashboard consumes `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard` for every competition of the day — live, finished and upcoming — plus per-match summaries for statistics and play-by-play. Nothing is fabricated: a match is only marked live when ESPN reports `status.type.state === "in"`, and unparseable values are omitted rather than invented.
* ⚽ **Live Match Statistics on the Cards**: live cards show the real score, the real match minute (`62'`, `HT`, `90'+3'`), yellow/red card chips counted from the scoreboard's match details and the goal scorers for both sides. Each card then polls `/api/match/{id}` every 30 s to stay current.
* 🗂️ **Live / Upcoming / Finished Tabs**: past, live and upcoming fixtures of the day in one dashboard, with tournament filters, multi-select search, favourite-team pinning and kickoff countdowns.
* 📊 **Enterprise Match Statistics**: real boxscore comparison rows (possession, shots, corners, fouls, cards …) with proportional bars — lime for home, sky for away — next to the real key-events log on the match page.
* 📡 **Channels That Never Disappear**: `/channels` server-renders the currently published `playlist.m3u`, falling back to GitHub’s base64 Contents API if raw access is blocked/HTML. It shows all statuses by default; CDN-blocked probes are **Standby**. Clicking a channel attempts playback through the signed `/api/proxy` player even if a probe failed.
* 🎨 **Burgundy & Lime Design System**: Tailwind v4 `@theme` tokens (legacy `navy-*` utility names now map to burgundy shades; `lime-*` maps to the new electric lime) drive every surface, button, active state and player control. Cards and live badges animate, respecting `prefers-reduced-motion`.
* 📺 **Interactive Stream Player**: auto-detects direct stream formats (HLS/m3u8/mp4) and uses `hls.js` for native low-latency playback, alongside iframe embeds with togglable sandbox shields.
* 🔀 **Server Selector & Automatic Failover**: every source becomes a server (Server 1, Server 2, …, Backup) with automatic failover on fatal errors, no-first-frame and stalls, plus a **Retry all** that re-signs fresh links.
* 🖥️ **Multistream Arena**: up to four matches side by side in a drag-to-resize grid with per-tile volume.
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
| **Vitest** | 4.1.7 | Unit + server-render component tests |

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
│   │   └── v1/                # 24h image proxies: league-logo, team-logo, poster
│   ├── api-hub/               # Developer docs: endpoints, real-data pipeline, upstream APIs
│   ├── channels/              # Server-rendered channel grid (all statuses shown)
│   ├── channel/[id]/          # Proxied playback for one channel + bounded status check
│   ├── watch/[matchId]/       # Live scoreboard, real stats, play-by-play, player + failover
│   ├── multistream/           # Up to 4 simultaneous players
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
│   ├── StreamPlayer.jsx       # hls.js/native playback, failover, sandbox toggle
│   └── ServerSelector.jsx     # Server 1 … Backup selector + in-player menu
├── lib/
│   ├── providers/espn.ts      # ★ Real ESPN fixture/statistics provider (pure normalisers)
│   ├── providers/             # WatchFooty, CDNLive, StreamedPk, LiveFeed (stream sources)
│   ├── broadcast/             # Feed parsers, channel resolver, resilient probe
│   ├── cache/                 # In-memory SWR + optional Upstash Redis
│   ├── player/                # Server labels, stream-kind detection, failover machine
│   ├── utils/matching.ts      # Fuzzy team and league matching
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

# Optional: comma-separated M3U/JSON live feed URLs (defaults to ibstvofficial/Live-events).
# Set to an empty string to disable live feeds.
# LIVE_FEED_URLS="https://raw.githubusercontent.com/ibstvofficial/Live-events/main/playlist.m3u"

# Optional: cached image proxy base (defaults to the catalogue provider)
# Optional: let /api/proxy reach LAN/loopback origins (local testing only)
# HLS_PROXY_ALLOW_PRIVATE_HOSTS=true

# Optional: Redis caching (Upstash) — falls back to in-memory caching when omitted
# UPSTASH_REDIS_REST_URL=""
# UPSTASH_REDIS_REST_TOKEN=""
```

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

### 5. Running Tests
```bash
npm run test
```
The suite covers the ESPN normalisers (live/upcoming/finished, minutes, cards, scorers, stats),
GitHub raw-to-Contents fallback, the signed and transparently labelled live-channel backups,
the channel probe policy (blocked → Standby, 404 → offline, HEAD-blocked → GET retry), the proxy
signing, the failover machine and server-rendered brand/live UI assertions.

---

## 🛠️ Developer REST API Directory

Interactive documentation lives at [`/api-hub`](https://eviv.si/api-hub).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/matches` | GET | ESPN fixtures enriched with catalogue servers or best-effort live-feed preview counts |
| `/api/match/[matchId]` | GET | Live score, minute, cards, scorers and incidents for one match |
| `/api/streams/[matchId]` | GET | Match-specific streams plus (live ESPN only) signed, unverified channel backups |
| `/api/stream-redirect` | GET | HMAC-validated redirect to upstream embed URLs |
| `/api/proxy` | GET | Signed HLS relay: playlists rewritten server-side, segments streamed, `Range`/`206`/CORS preserved |
| `/api/live-channels` | GET | Feed channels + best-effort status (`live`, `unknown` → “Standby”, `offline`); never hides channels |
| `/api/v1/league-logo/[id]` | GET | Cached league logo proxy (24h) |
| `/api/v1/team-logo/[id]` | GET | Cached team badge proxy (24h) |
| `/api/v1/poster/[id]` | GET | Cached match poster proxy (24h) |

### Channel status semantics

| Status | Meaning | UI |
|--------|---------|-----|
| `live` | Probe fetched a real playlist/media response | Lime pulsing **Live** pill |
| `unknown` | Probe blocked (403/405/429/5xx), timed out, or unreadable body | Neutral **Standby** pill — still playable |
| `offline` | Upstream answered 404/410 or served an HTML page | **Unreachable** pill — playback still attempted |
| `checking` | Probe still running | Amber **Checking** pill |

Every channel links to `/channel/{id}`, which mints a signed `/api/proxy` URL regardless of the probe result. For an unlinked *live* ESPN fixture only, up to three football feed channels (confirmed live first, standby next; known offline excluded) are offered as **unverified backups**. They are not claimed to broadcast that fixture; playback depends on the third-party source.

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
* **Sandbox Integrity**: keep third-party ads and redirects isolated inside the player sandbox.
* **Tests**: normalisers and probe policy changes come with `vitest` cases (`npm run test`).

---

## ⚖️ License & Disclaimer

EVIV Live is an open-source aggregator. It reads public sports data and public third-party link networks
for research and educational purposes. EVIV Live does not host, upload or own any media streams, video
channels or sports network content.
