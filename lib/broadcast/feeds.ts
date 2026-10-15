/**
 * Live feed engine: loads dynamic M3U / JSON playlists (e.g. the
 * `ibstvofficial/Live-events` playlist), normalises them into live channels,
 * and provides the playback URL for each one — always routed through the
 * signed `/api/proxy` endpoint.
 *
 * Configuration
 *  - `LIVE_FEED_URLS`: comma-separated list of playlist URLs (M3U or JSON).
 *    Unset → `DEFAULT_LIVE_FEEDS`. Set to an empty string to disable feeds.
 */
import crypto from 'crypto';
import logger from '../logger';
import { getCacheManager } from '../cache/cacheManager';
import { buildProxyUrl, isDirectStreamUrl, parseSafeUpstreamUrl } from '../hlsProxy';
import { parseM3U } from './m3u';
import { parseJsonFeed } from './json';
import type { FeedEntry, LiveChannel } from './types';

// This is the file currently published by Live-events; live.m3u8 may be
// published later, but is not present in the repository at the moment.
export const DEFAULT_LIVE_FEEDS = [
  'https://raw.githubusercontent.com/ibstvofficial/Live-events/main/playlist.m3u',
];

/** How long a loaded set of feeds is reused before re-fetching. The feeds
 *  refresh often and tokens rotate, so 10 minutes keeps the list fresh while
 *  absorbing upstream rate limits and outages. */
export const FEED_CACHE_TTL_S = 10 * 60;
const FEED_CACHE_TTL_MS = FEED_CACHE_TTL_S * 1000;
const FEED_RAW_TIMEOUT_MS = 3_500;
const FEED_API_TIMEOUT_MS = 8_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Titles that are promotional banners rather than playable events (the
 * Live-events playlist ships several of these pointing at a dummy .mp4).
 */
const PROMO_TITLE_RE = /promotion|download|telegram|whatsapp|t\.me|contact us|advertis/i;

export function getFeedUrls(raw: string | undefined = process.env.LIVE_FEED_URLS): string[] {
  if (raw === undefined) return DEFAULT_LIVE_FEEDS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
}

/** Parse feed text, sniffing M3U vs JSON from its content. */
export function parseFeedText(text: string, feedUrl: string): FeedEntry[] {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  // #EXT-X-* identifies a media/variant HLS manifest, not a list of channels.
  if (trimmed.startsWith('#EXTM3U') && /^#EXT-X-/m.test(trimmed)) return [];
  if (trimmed.startsWith('#EXTM3U') || trimmed.includes('#EXTINF')) {
    return parseM3U(text, feedUrl);
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonFeed(text, feedUrl);
  }
  return [];
}

/** A feed entry can be routed through the HLS proxy only if it is a public
 *  http(s) URL the proxy will accept and looks like a direct stream. */
export function isPlayableFeedUrl(url: string): boolean {
  return parseSafeUpstreamUrl(url) !== null && isDirectStreamUrl(url);
}

/** Stable channel id: survives playlist refreshes that rotate URL tokens. */
export function channelIdFor(entry: FeedEntry): string {
  const key = `${entry.feedUrl}|${entry.tvgId || entry.name.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Filter out promos / non-playable URLs, drop exact duplicate URLs, and assign
 * stable ids (ordinal-suffixed when two entries would otherwise collide).
 */
export function buildLiveChannels(entries: FeedEntry[]): LiveChannel[] {
  const seenUrls = new Set<string>();
  const idCounts = new Map<string, number>();
  const out: LiveChannel[] = [];

  for (const entry of entries) {
    if (PROMO_TITLE_RE.test(entry.name)) continue;
    if (!isPlayableFeedUrl(entry.url)) continue;
    if (seenUrls.has(entry.url)) continue;
    seenUrls.add(entry.url);

    const base = channelIdFor(entry);
    const n = (idCounts.get(base) ?? 0) + 1;
    idCounts.set(base, n);
    out.push({ ...entry, id: n === 1 ? base : `${base}-${n}` });
  }

  return out;
}

/** Relative, signed `/api/proxy` URL that plays this channel. */
export function toPlaybackUrl(entry: Pick<FeedEntry, 'url' | 'referer'>): string {
  return buildProxyUrl(entry.url, { referer: entry.referer });
}

/**
 * GitHub blob/raw URL → GitHub Contents API URL.
 *
 * Playlists hosted on GitHub are frequently served through
 * `raw.githubusercontent.com`, which several networks (and CDN-side
 * rate limits) block. The Contents API returns the very same file — real data,
 * just a different transport — so it is used as an automatic fallback.
 */
export function githubContentsApiUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'api.github.com' &&
        /^\/repos\/[^/]+\/[^/]+\/contents\/.+/.test(parsed.pathname)) {
      return parsed.href;
    }
    if (parsed.hostname === 'github.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        const [owner, repo, , ref, ...rest] = parts;
        return `https://api.github.com/repos/${owner}/${repo}/contents/${rest.join('/')}?ref=${ref}`;
      }
      return null;
    }
    if (parsed.hostname === 'raw.githubusercontent.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const [owner, repo, ref, ...rest] = parts;
        return `https://api.github.com/repos/${owner}/${repo}/contents/${rest.join('/')}?ref=${ref}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Decode an inline, base64-encoded GitHub Contents API file response. */
export function decodeGithubContents(payload: any): string | null {
  if (!payload || Array.isArray(payload) || payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    return null;
  }
  // GitHub inserts newlines into base64 content. Reject bad/oversized payloads
  // rather than letting Buffer.from silently decode an HTML/rate-limit page.
  const content = payload.content.replace(/\s/g, '');
  if (!content || content.length > Math.ceil(MAX_FEED_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    return null;
  }
  const data = Buffer.from(content, 'base64');
  return data.length <= MAX_FEED_BYTES ? data.toString('utf8') : null;
}

/**
 * The repository has used both live.m3u8 and playlist.m3u. Try the requested
 * file first, then the other name if it is missing (live.m3u8 is currently 404).
 * For other GitHub repositories, only fetch the URL the user configured.
 */
function githubContentsCandidates(feedUrl: string): string[] {
  const first = githubContentsApiUrl(feedUrl);
  if (!first) return [];
  const parsed = new URL(first);
  const path = parsed.pathname;
  const root = '/repos/ibstvofficial/Live-events/contents/';
  if (!path.startsWith(root)) return [first];
  const filename = path.slice(root.length);
  if (filename !== 'playlist.m3u' && filename !== 'live.m3u8') return [first];
  const other = filename === 'playlist.m3u' ? 'live.m3u8' : 'playlist.m3u';
  return [first, `https://api.github.com${root}${other}${parsed.search}`];
}

function assertPlaylist(text: string, feedUrl: string): string {
  if (!parseFeedText(text, feedUrl).length) {
    throw new Error('Feed did not contain any channel entries');
  }
  return text;
}

async function fetchFeedTextOnce(feedUrl: string): Promise<string> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/x-mpegURL, application/json, text/plain, */*' },
    cache: 'no-store',
    signal: AbortSignal.timeout(FEED_RAW_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_FEED_BYTES) throw new Error('Feed exceeds size limit');
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_FEED_BYTES) throw new Error('Feed exceeds size limit');
  // A 200 HTML block (or a media HLS playlist, not a channel playlist) must
  // also trigger fallback. Otherwise it is cached as a successful empty feed.
  return assertPlaylist(text, feedUrl);
}

/** Fetch one playlist, retrying via GitHub's base64 Contents API when raw fetching fails. */
export async function fetchFeedText(feedUrl: string): Promise<string> {
  let firstError: unknown;
  // A Contents API URL may also be supplied directly in LIVE_FEED_URLS.
  // Its JSON response must be base64-decoded, never parsed as a JSON channel list.
  if (!feedUrl.startsWith('https://api.github.com/repos/')) {
    try {
      return await fetchFeedTextOnce(feedUrl);
    } catch (err) {
      firstError = err;
    }
  }

  // Each request gets its own timeout: a raw-host timeout must not abort the
  // API fallback before it has a chance to make a request on Vercel.
  for (const apiUrl of githubContentsCandidates(feedUrl)) {
    try {
      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(FEED_API_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = decodeGithubContents(await res.json());
      if (!text) throw new Error('Missing or invalid base64 playlist');
      const playlist = assertPlaylist(text, feedUrl);
      logger.info('Live feed loaded through the GitHub contents API', { feed: feedUrl, apiUrl });
      return playlist;
    } catch (err: any) {
      logger.debug('GitHub contents fallback failed', { feed: feedUrl, apiUrl, error: err?.message });
    }
  }

  throw firstError ?? new Error('Feed fetch failed');
}

async function loadLiveChannels(): Promise<LiveChannel[]> {
  const urls = getFeedUrls();
  if (urls.length === 0) return [];

  const results = await Promise.allSettled(
    urls.map(async (url) => parseFeedText(await fetchFeedText(url), url))
  );

  const entries: FeedEntry[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') entries.push(...r.value);
    else logger.error('Live feed fetch failed', r.reason, { feed: urls[i] });
  });

  // Every feed failed → throw so the failure is not cached as an empty list.
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error('All live feeds failed');
  }

  const channels = buildLiveChannels(entries);
  if (!channels.length) throw new Error('Live feeds contained no playable channels');
  logger.info('Live feeds loaded', { feeds: urls.length, entries: entries.length, channels: channels.length });
  return channels;
}

/* -------------------------------------------------------------------------- */
/*  Server-side memory cache + never-fail fallback chain                       */
/* -------------------------------------------------------------------------- */

/** Standby channels used when every feed path is down. These are long-lived,
 *  public 24/7 HLS streams — real playback, honestly labelled — so the
 *  /channels grid always renders something instead of an error banner. */
const STANDBY_FEED_URL = 'eviv://standby';

const STATIC_FALLBACK_ENTRIES: FeedEntry[] = [
  {
    name: 'Red Bull TV (Standby)',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    group: 'Standby Channels',
    tvgId: 'eviv-standby-redbull',
    source: STANDBY_FEED_URL,
    feedUrl: STANDBY_FEED_URL,
  },
  {
    name: 'Al Jazeera English (Standby)',
    url: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8',
    group: 'Standby Channels',
    tvgId: 'eviv-standby-aljazeera',
    source: STANDBY_FEED_URL,
    feedUrl: STANDBY_FEED_URL,
  },
  {
    name: 'France 24 English (Standby)',
    url: 'https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8',
    group: 'Standby Channels',
    tvgId: 'eviv-standby-france24',
    source: STANDBY_FEED_URL,
    feedUrl: STANDBY_FEED_URL,
  },
];

/** Built once — pure transformation of the static definitions above. */
export const STATIC_FALLBACK_CHANNELS: LiveChannel[] = buildLiveChannels(STATIC_FALLBACK_ENTRIES);

/** The static fallback channel definitions (stable ids, playable URLs). */
export function getStaticFallbackChannels(): LiveChannel[] {
  return STATIC_FALLBACK_CHANNELS;
}

/** Last successfully loaded channel list (survives transient feed failures). */
let channelMemory: { channels: LiveChannel[]; fetchedAt: number } | null = null;

/** Remember a fresh channel list in the server-side memory cache. */
export function rememberChannelList(channels: LiveChannel[]): void {
  if (channels.length) channelMemory = { channels, fetchedAt: Date.now() };
}

/** Test hook: clear the server-side memory cache. */
export function resetChannelMemoryCache(): void {
  channelMemory = null;
}

/**
 * All playable live channels from the configured feeds.
 *
 * Resilience chain — this NEVER throws and never returns an error state the
 * UI would have to show as a scary banner:
 *   1. 10-minute server-side memory cache (fresh list),
 *   2. cache-manager SWR (Redis / memory) → GitHub Contents API inside it,
 *   3. last-known-good list even when stale,
 *   4. static fallback channel definitions.
 * Explicitly disabled feeds (`LIVE_FEED_URLS=''`) still yield an empty list.
 */
export async function getLiveChannels(): Promise<LiveChannel[]> {
  if (getFeedUrls().length === 0) return [];

  if (channelMemory && Date.now() - channelMemory.fetchedAt <= FEED_CACHE_TTL_MS) {
    return channelMemory.channels;
  }

  try {
    const channels = await getCacheManager().swr('live_feed_channels_v2', loadLiveChannels, FEED_CACHE_TTL_S);
    if (channels.length) {
      rememberChannelList(channels);
      return channels;
    }
  } catch (err) {
    logger.error('Live feed refresh failed; serving cached channels', err);
  }

  // A stale list beats no list: visitors keep the last working channels.
  if (channelMemory) return channelMemory.channels;

  return getStaticFallbackChannels();
}

/** Look a channel up by its stable id. */
export async function getLiveChannelById(id: string): Promise<LiveChannel | null> {
  const channels = await getLiveChannels();
  return channels.find((c) => c.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Alternate sources for one channel                                         */
/* -------------------------------------------------------------------------- */

/** Most servers offered for a single channel. */
export const MAX_CHANNEL_SOURCES = 8;

/** Titles too generic to prove two entries are the same channel. */
const GENERIC_TITLES = new Set(['live event', 'live stream', 'live tv']);

/**
 * Title normalised for "is this the same channel?" checks: case, accents and
 * punctuation are ignored, as is the " (2)" suffix the JSON parser gives each
 * stream of a multi-stream item.
 */
export function normalizeChannelTitle(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Only multi-word, non-generic titles are trusted to identify a channel. */
function isDistinctiveTitle(title: string): boolean {
  return title.includes(' ') && !GENERIC_TITLES.has(title);
}

/**
 * Every playable source for channel `id`: the channel itself first, then the
 * other entries carrying the same channel — duplicate listings in the same feed
 * (same tvg-id) and entries with the same distinctive title in any feed — in
 * feed order. The player offers them as Server 1, Server 2, …, Backup.
 */
export function findChannelSources(channels: LiveChannel[], id: string): LiveChannel[] {
  const primary = channels.find((c) => c.id === id);
  if (!primary) return [];

  const title = normalizeChannelTitle(primary.name);
  const matchByTitle = isDistinctiveTitle(title);

  const siblings = channels.filter(
    (c) =>
      c.id !== primary.id &&
      ((!!primary.tvgId && c.feedUrl === primary.feedUrl && c.tvgId === primary.tvgId) ||
        (matchByTitle && normalizeChannelTitle(c.name) === title))
  );

  return [primary, ...siblings].slice(0, MAX_CHANNEL_SOURCES);
}

/** The channel `id` plus its alternate sources (empty when the id is unknown). */
export async function getChannelSources(id: string): Promise<LiveChannel[]> {
  return findChannelSources(await getLiveChannels(), id);
}
