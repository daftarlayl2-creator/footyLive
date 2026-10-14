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

export const DEFAULT_LIVE_FEEDS = [
  'https://raw.githubusercontent.com/ibstvofficial/Live-events/main/playlist.m3u',
];

/** How long a loaded set of feeds is reused before re-fetching. Tokens in
 *  upstream URLs rotate, so keep this well under the feeds' own refresh cycle. */
export const FEED_CACHE_TTL_S = 5 * 60;
const FEED_FETCH_TIMEOUT_MS = 8_000;
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

async function fetchFeedText(feedUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/x-mpegURL, application/json, text/plain, */*' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error('Feed exceeds size limit');
    return text;
  } finally {
    clearTimeout(timer);
  }
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
  logger.info('Live feeds loaded', { feeds: urls.length, entries: entries.length, channels: channels.length });
  return channels;
}

/** All playable live channels from the configured feeds (cached). */
export async function getLiveChannels(): Promise<LiveChannel[]> {
  return getCacheManager().swr('live_feed_channels', loadLiveChannels, FEED_CACHE_TTL_S);
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
