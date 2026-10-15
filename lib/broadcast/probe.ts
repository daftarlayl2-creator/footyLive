/** Bounded media/latency probes. CDN blocks stay unknown, never falsely offline. */
import crypto from 'crypto';
import logger from '../logger';
import { getCacheManager } from '../cache/cacheManager';
import { isPlaylistUrl, parseSafeUpstreamUrl } from '../hlsProxy';
import { unknownHealth, type StreamHealth } from '../player/health';
import type { ChannelStatus, LiveChannel } from './types';

export const PROBE_TIMEOUT_MS = 3_500;
export const PROBE_TTL_S = 30;
export const MAX_PROBES_PER_REQUEST = 48;
const PROBE_CONCURRENCY = 12;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 407, 429, 451, 500, 502, 503, 504]);
const GONE_STATUSES = new Set([404, 410]);
type ProbeTarget = Pick<LiveChannel, 'url' | 'referer'>;

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([p, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

function probeHeaders(channel: ProbeTarget): Record<string, string> {
  const referer = channel.referer || `${new URL(channel.url).origin}/`;
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'cross-site',
  };
  try { headers.Referer = new URL(referer).href; headers.Origin = new URL(referer).origin; } catch { /* optional hint */ }
  return headers;
}

/** Validate every redirect hop as well as the initial URL (no open SSRF probe). */
async function requestOnce(channel: ProbeTarget, signal: AbortSignal, method: 'GET' | 'HEAD', range: boolean): Promise<{ response: Response; url: string }> {
  const headers = probeHeaders(channel);
  if (range) headers.Range = 'bytes=0-8191';
  let url = channel.url;
  for (let hop = 0; hop <= 3; hop++) {
    const target = parseSafeUpstreamUrl(url);
    if (!target) throw new Error('Unsafe probe target');
    const response = await fetch(target.href, { method, headers, cache: 'no-store', redirect: 'manual', signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: target.href };
    await response.body?.cancel().catch(() => {});
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid upstream redirect');
    url = new URL(location, url).href;
  }
  throw new Error('Too many upstream redirects');
}

async function probeStatus(channel: ProbeTarget, controller: AbortController): Promise<ChannelStatus> {
  if (!parseSafeUpstreamUrl(channel.url)) return 'unknown';
  for (const [method, range] of [['GET', true], ['GET', false], ['HEAD', false]] as const) {
    let response: Response;
    try { ({ response } = await requestOnce(channel, controller.signal, method, range)); }
    catch {
      if (controller.signal.aborted) return 'unknown';
      continue;
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      if (GONE_STATUSES.has(response.status)) return 'offline';
      if (BLOCKED_STATUSES.has(response.status) || !response.ok) continue;
      const contentType = response.headers.get('content-type') || '';
      if (/text\/html/i.test(contentType)) return 'offline';
      // A successful HEAD is reachability, not proof of a working HLS manifest.
      if (!response.body || method === 'HEAD') return 'unknown';
      const mediaFile = !isPlaylistUrl(channel.url) && /\.(mp4|webm|m4v)(?:[?#]|$)/i.test(channel.url);

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let head = '';
      let bytes = 0;
      while (bytes < 8192) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value.subarray(0, 8192 - bytes);
        bytes += chunk.length;
        head += decoder.decode(chunk, { stream: true });
        if (head.trimStart().startsWith('#EXTM3U')) return 'live';
        if (/<(?:html|!doctype\s+html)\b/i.test(head)) return 'offline';
        if (mediaFile && bytes > 0) return 'live';
      }
      return 'unknown';
    } finally {
      // Including rejected/rate-limited bodies: never leave upstream connections open.
      if (reader) await reader.cancel().catch(() => {});
      else await response.body?.cancel().catch(() => {});
    }
  }
  return 'unknown';
}

/** Read just a media sample, cancelling even when a CDN ignores Range. */
async function readMediaHead(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 8192 - size);
      size += chunk.byteLength;
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function looksLikeMedia(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const box = new TextDecoder().decode(bytes.subarray(4, 8));
  if (/^(ftyp|styp|moof|moov|sidx|emsg)$/.test(box)) return true;
  if (bytes[0] === 0x47 && (bytes[188] === 0x47 || bytes.length < 188)) return true; // MPEG-TS
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return true; // ADTS audio
  if (new TextDecoder().decode(bytes.subarray(0, 3)) === 'ID3') return true;
  // AES-encrypted segments have no magic bytes. Binary control bytes exclude
  // ordinary JSON/text login errors, including non-ASCII error messages.
  return bytes.some((byte) => byte < 9 || (byte > 13 && byte < 32));
}

/** Strong startup verification for automatic IPTV-Org injection: follow a
 * bounded master/media chain and fetch a real segment, not merely #EXTM3U.
 * The same deadline, redirect validation, Referer and byte caps apply to every hop.
 * This is not a promise of rights, sustained decoding or viewer-side bandwidth. */
async function probeMediaStatus(channel: ProbeTarget, controller: AbortController): Promise<ChannelStatus> {
  let url = channel.url;
  let expectsMedia = /\.(?:mp4|webm|m4v)(?:[?#]|$)/i.test(url);
  for (let depth = 0; depth <= 2; depth++) {
    let sample: { bytes: Uint8Array; url: string } | undefined;
    for (const range of [true, false]) {
      try {
        const result = await requestOnce({ ...channel, url }, controller.signal, 'GET', range);
        try {
          if (GONE_STATUSES.has(result.response.status)) return 'offline';
          if (!result.response.ok) continue;
          if (/text\/html/i.test(result.response.headers.get('content-type') || '')) return 'offline';
          sample = { bytes: await readMediaHead(result.response), url: result.url };
          break;
        } finally { await result.response.body?.cancel().catch(() => {}); }
      } catch { if (controller.signal.aborted) return 'unknown'; }
    }
    if (!sample?.bytes.length) return 'unknown';
    const text = new TextDecoder().decode(sample.bytes).trimStart();
    if (/<(?:html|!doctype\s+html)\b/i.test(text)) return 'offline';
    if (!text.startsWith('#EXTM3U')) return expectsMedia && looksLikeMedia(sample.bytes) ? 'live' : 'unknown';
    if (!/^#EXT-X-(?:STREAM-INF|TARGETDURATION):/im.test(text)) return 'unknown';
    // A protected/DRM playlist is not a working public automatic backup.
    if (/^#EXT-X-(?:SESSION-)?KEY:.*(?:METHOD=SAMPLE-AES|KEYFORMAT="(?!identity")|METHOD=AES-128)/im.test(text)) return 'unknown';
    const uri = text.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('#'))?.trim();
    if (!uri || depth === 2) return 'unknown';
    expectsMedia = /^#EXT-X-TARGETDURATION:/im.test(text) && !/^#EXT-X-STREAM-INF:/im.test(text);
    try { url = new URL(uri, sample.url).href; } catch { return 'unknown'; }
    if (!parseSafeUpstreamUrl(url)) return 'unknown';
  }
  return 'unknown';
}

/** Never throws; latency covers the whole successful media probe (not an ICMP ping). */
export async function probeChannelHealth(channel: ProbeTarget, options: { verifyMedia?: boolean } = {}): Promise<StreamHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const status = await withTimeout(options.verifyMedia ? probeMediaStatus(channel, controller) : probeStatus(channel, controller), PROBE_TIMEOUT_MS, 'unknown' as ChannelStatus);
    return { status, latencyMs: status === 'live' ? Math.max(1, Math.round(performance.now() - started)) : null,
      checkedAt: Date.now(), successRate: status === 'live' ? 1 : 0, samples: 1,
      ...(options.verifyMedia ? { mediaVerified: status === 'live' } : {}) };
  } catch {
    logger.debug('Channel health probe unavailable');
    return { ...unknownHealth(), checkedAt: Date.now(), samples: 1 };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Backwards-compatible status-only API for channel listings. */
export async function probeChannel(channel: ProbeTarget): Promise<ChannelStatus> {
  return (await probeChannelHealth(channel)).status;
}

interface ProbeHistory { samples: StreamHealth[] }
const inflight = new Map<string, Promise<StreamHealth>>();

async function cachedHealth(channel: ProbeTarget, verifyMedia = false): Promise<StreamHealth> {
  const cache = getCacheManager();
  // Include the actual URL + referer, not just a stable feed id: rotated tokens
  // must not inherit a stale offline result from the previous signed source.
  const identity = crypto.createHash('sha256').update(`${channel.url}|${channel.referer || ''}`).digest('hex');
  const mediaKey = `stream:health:v2:media:${identity}`;
  const key = verifyMedia ? mediaKey : `stream:health:v2:manifest:${identity}`;
  // Reuse stronger results in the player without re-probing/downgrading them.
  const verified = await cache.get<StreamHealth>(mediaKey);
  if (verified && Date.now() - verified.checkedAt < PROBE_TTL_S * 1000) return verified;
  if (!verifyMedia && inflight.has(mediaKey)) return inflight.get(mediaKey)!;
  // Once a source enters the strong pool, periodic player health checks keep
  // checking its segments, rather than downgrading to header-only pings.
  if (!verifyMedia && await cache.get<ProbeHistory>(`${mediaKey}:history`)) return cachedHealth(channel, true);
  const cached = verifyMedia ? null : await cache.get<StreamHealth>(key);
  if (cached && Date.now() - cached.checkedAt < PROBE_TTL_S * 1000) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const [health, history] = await Promise.all([probeChannelHealth(channel, { verifyMedia }), cache.get<ProbeHistory>(`${key}:history`)]);
    const samples = [...(history?.samples ?? []), health].slice(-5);
    const result = { ...health, samples: samples.length, successRate: samples.filter((sample) => sample.status === 'live').length / samples.length };
    await Promise.all([cache.set(key, result, PROBE_TTL_S), cache.set(`${key}:history`, { samples }, 600)]);
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

/** Bounded concurrency, hard per-probe deadlines and a shared 30-second cache. */
export async function getChannelHealth(channels: Array<ProbeTarget & { id: string }>, options: { limit?: number; verifyMedia?: boolean } = {}): Promise<Record<string, StreamHealth>> {
  const limit = Math.max(0, Math.min(options.limit ?? MAX_PROBES_PER_REQUEST, MAX_PROBES_PER_REQUEST, channels.length));
  const health: Record<string, StreamHealth> = Object.fromEntries(channels.map((channel) => [channel.id, unknownHealth()]));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, PROBE_CONCURRENCY) }, async () => {
    while (cursor < limit) {
      const channel = channels[cursor++];
      try { health[channel.id] = await cachedHealth(channel, options.verifyMedia); }
      catch { health[channel.id] = unknownHealth(); }
    }
  }));
  return health;
}

export async function getChannelStatuses(channels: LiveChannel[], options: { limit?: number; verifyMedia?: boolean } = {}): Promise<Record<string, ChannelStatus>> {
  return Object.fromEntries(Object.entries(await getChannelHealth(channels, options)).map(([id, health]) => [id, health.status]));
}
