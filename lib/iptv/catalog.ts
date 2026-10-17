/**
 * Dynamic IPTV catalogue from the project playlist repository
 * (`daftarlayl2-creator/iptv`, an iptv-org-style tree: `streams/{cc}.m3u`
 * per country on the `master` branch — verified by cloning the repo).
 *
 * Sources are restricted to that repository: playlist URLs must be HTTPS
 * on `raw.githubusercontent.com` under `/daftarlayl2-creator/iptv/`, or on
 * the owner's Pages host. Arbitrary/user-supplied URLs are never fetched
 * (SSRF guard). Parsing reuses the tolerant `parseM3U` (quoted attrs,
 * `#EXTVLCOPT`, malformed lines, http(s)-only stream URLs).
 *
 * Resilience: responses are cached (configurable TTL), every playlist is
 * fetched with a timeout, one bad playlist never sinks the catalogue, and
 * the last known valid catalogue is served (marked `stale`) when a full
 * refresh yields nothing. No channel is ever fabricated.
 */
import { createHash } from 'node:crypto';
import logger from '../logger';
import { parseM3U } from '../broadcast/m3u';
import { getCacheManager } from '../cache/cacheManager';

export interface IptvChannel {
  id: string;
  name: string;
  tvgId?: string;
  logo?: string;
  /** Category from `group-title` when present, else `Uncategorized`. */
  category: string;
  /** Country/region code from the playlist filename (e.g. `MA`), or ''. */
  region: string;
  quality?: string;
  /** Upstream stream URL (server-side only; never sent to clients raw). */
  url: string;
  referer?: string;
  /** Playlist the entry came from (display label, e.g. `ma.m3u`). */
  playlist: string;
}

export interface IptvSourceStatus {
  /** Playlist label (never the raw URL). */
  playlist: string;
  ok: boolean;
  count: number;
}

export interface IptvCatalog {
  channels: IptvChannel[];
  categories: string[];
  regions: string[];
  sources: IptvSourceStatus[];
  generatedAt: number;
  /** True when serving the last known valid catalogue after a failed refresh. */
  stale: boolean;
}

/** Client-safe catalogue entry (no raw stream URL). */
export interface PublicIptvChannel {
  id: string;
  name: string;
  logo: string;
  category: string;
  region: string;
  quality: string;
  href: string;
}

export const IPTV_REPO = 'daftarlayl2-creator/iptv';
export const DEFAULT_RAW_BASE = `https://raw.githubusercontent.com/${IPTV_REPO}/master/streams`;
/** Countries verified present in the repository (sports-relevant default set). */
export const DEFAULT_COUNTRIES = ['ma', 'dz', 'tn', 'eg', 'sa', 'ae', 'qa', 'fr', 'es', 'uk'];

const FETCH_TIMEOUT_MS = 8_000;
const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function catalogTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.IPTV_CATALOG_TTL_S || '', 10);
  return Number.isFinite(parsed) ? Math.min(86_400, Math.max(60, parsed)) : 900;
}

interface PlaylistSource {
  url: string;
  label: string;
  region: string;
}

/** Only the owner's repository may be fetched server-side (SSRF guard). */
export function isApprovedPlaylistUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.hostname === 'raw.githubusercontent.com') {
      return url.pathname.startsWith(`/${IPTV_REPO}/`);
    }
    return url.hostname === 'daftarlayl2-creator.github.io';
  } catch {
    return false;
  }
}

function regionFromFilename(url: string): string {
  const base = url.split('/').pop()?.replace(/\.m3u8?$/i, '') ?? '';
  return /^[a-z]{2}$/i.test(base) ? base.toUpperCase() : '';
}

function labelFromUrl(url: string): string {
  return url.split('/').pop() || 'playlist.m3u';
}

/**
 * The playlist sources to load. `IPTV_PLAYLIST_URLS` (comma-separated,
 * allowlisted) wins; otherwise `streams/{cc}.m3u` for `IPTV_COUNTRIES`
 * (or the verified default set) under `IPTV_REPO_RAW_BASE`.
 */
export function resolvePlaylistSources(): PlaylistSource[] {
  const explicit = (process.env.IPTV_PLAYLIST_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (explicit.length) {
    const approved = explicit.filter(isApprovedPlaylistUrl);
    if (approved.length !== explicit.length) {
      logger.warn('IPTV: dropped non-allowlisted playlist URLs', { dropped: explicit.length - approved.length });
    }
    return approved.map((url) => ({ url, label: labelFromUrl(url), region: regionFromFilename(url) }));
  }

  let base = (process.env.IPTV_REPO_RAW_BASE || DEFAULT_RAW_BASE).replace(/\/+$/, '');
  if (!isApprovedPlaylistUrl(`${base}/ma.m3u`)) {
    logger.warn('IPTV: IPTV_REPO_RAW_BASE is not allowlisted; using default repository base');
    base = DEFAULT_RAW_BASE;
  }
  const countries = (process.env.IPTV_COUNTRIES || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^[a-z]{2}$/.test(c));
  const list = countries.length ? [...new Set(countries)] : DEFAULT_COUNTRIES;
  return list.map((cc) => ({
    url: `${base}/${cc}.m3u`,
    label: `${cc}.m3u`,
    region: cc.toUpperCase(),
  }));
}

function channelId(tvgId: string | undefined, name: string, url: string): string {
  let stableUrl = url;
  try {
    const parsed = new URL(url);
    stableUrl = `${parsed.hostname}${parsed.pathname}`;
  } catch { /* keep raw */ }
  const seed = `${tvgId || name}|${stableUrl}`;
  return `iptv-${createHash('sha256').update(seed).digest('hex').slice(0, 14)}`;
}

async function fetchPlaylist(source: PlaylistSource): Promise<IptvChannel[]> {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PLAYLIST_BYTES) throw new Error('Playlist too large');
  const text = await res.text();
  if (text.length > MAX_PLAYLIST_BYTES) throw new Error('Playlist too large');

  return parseM3U(text, source.url).map((entry) => ({
    id: channelId(entry.tvgId, entry.name, entry.url),
    name: entry.name,
    ...(entry.tvgId ? { tvgId: entry.tvgId } : {}),
    ...(entry.logo ? { logo: entry.logo } : {}),
    category: entry.group?.split(/[;|]/)[0]?.trim() || 'Uncategorized',
    region: source.region,
    ...(entry.quality ? { quality: entry.quality } : {}),
    url: entry.url,
    ...(entry.referer ? { referer: entry.referer } : {}),
    playlist: source.label,
  }));
}

async function loadCatalog(): Promise<IptvCatalog> {
  const sources = resolvePlaylistSources();
  const results = await Promise.allSettled(sources.map(fetchPlaylist));

  const byId = new Map<string, IptvChannel>();
  const statuses: IptvSourceStatus[] = [];
  results.forEach((result, i) => {
    const source = sources[i];
    if (result.status === 'fulfilled') {
      let added = 0;
      for (const channel of result.value) {
        if (!byId.has(channel.id)) {
          byId.set(channel.id, channel);
          added += 1;
        }
      }
      statuses.push({ playlist: source.label, ok: true, count: added });
    } else {
      // Detail stays in server logs (admin diagnostics), never in the UI.
      logger.warn('IPTV playlist fetch failed', { playlist: source.label, error: String(result.reason?.message || result.reason) });
      statuses.push({ playlist: source.label, ok: false, count: 0 });
    }
  });

  const channels = [...byId.values()].sort(
    (a, b) => a.region.localeCompare(b.region) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
  return {
    channels,
    categories: [...new Set(channels.map((c) => c.category))].sort(),
    regions: [...new Set(channels.map((c) => c.region).filter(Boolean))].sort(),
    sources: statuses,
    generatedAt: Date.now(),
    stale: false,
  };
}

let lastKnownGood: IptvCatalog | null = null;

/** Test hook: forget the last known valid catalogue. */
export function resetIptvCatalogMemory(): void {
  lastKnownGood = null;
}

/** The IPTV catalogue — cached, resilient, never throws, never fabricated. */
export async function getIptvCatalog(): Promise<IptvCatalog> {
  try {
    const catalog = await getCacheManager().swr('iptv_catalog_v1', loadCatalog, catalogTtlSeconds());
    if (catalog.channels.length) {
      lastKnownGood = catalog;
      return catalog;
    }
    if (lastKnownGood) return { ...lastKnownGood, stale: true };
    return catalog;
  } catch (err) {
    logger.error('IPTV catalogue load failed', err);
    if (lastKnownGood) return { ...lastKnownGood, stale: true };
    return { channels: [], categories: [], regions: [], sources: [], generatedAt: Date.now(), stale: false };
  }
}

export async function getIptvChannelById(id: string): Promise<IptvChannel | null> {
  const catalog = await getIptvCatalog();
  return catalog.channels.find((c) => c.id === id) ?? null;
}

/** Strip server-only fields (raw URL/referer) for API responses and RSC. */
export function toPublicChannel(channel: IptvChannel): PublicIptvChannel {
  return {
    id: channel.id,
    name: channel.name,
    logo: channel.logo || '',
    category: channel.category,
    region: channel.region,
    quality: channel.quality || '',
    href: `/iptv/${channel.id}`,
  };
}
