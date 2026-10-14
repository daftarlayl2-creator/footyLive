/**
 * Lightweight "is this channel actually up?" probe used to drive the live
 * status indicators in the UI. Results are cached per channel so repeated
 * page polls do not hammer upstream CDNs.
 *
 * Probing rules (learned from real CDN behaviour):
 *  - A ranged GET is used first; many CDNs reject `HEAD` outright (403/405)
 *    even though the stream plays fine, so we never fail a channel on HEAD.
 *  - Browser-like headers (Referer, Origin, Sec-Fetch-*) are sent, because
 *    hotlink protection is usually what makes a probe "fail" on a Vercel or
 *    Cloudflare egress IP.
 *  - Only an explicit 404/410 — or a 200 that is clearly not media — counts as
 *    `offline`. Blocks, rate limits, 5xx and network errors resolve to
 *    `unknown`, which the UI labels "Standby": the channel stays clickable and
 *    playback is still attempted through `/api/proxy`.
 */
import logger from '../logger';
import { getCacheManager } from '../cache/cacheManager';
import { isPlaylistUrl } from '../hlsProxy';
import type { ChannelStatus, LiveChannel } from './types';

export const PROBE_TIMEOUT_MS = 3_500;
/** How long a probe result is considered fresh. */
export const PROBE_TTL_S = 90;
/** Upper bound on channels probed per request; the rest report `unknown`. */
export const MAX_PROBES_PER_REQUEST = 48;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** HTTP statuses that mean "we were blocked", not "the channel is down". */
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 407, 429, 451, 500, 502, 503, 504]);
/** Statuses that mean the upstream really does not serve this channel. */
const GONE_STATUSES = new Set([404, 410]);

/** Resolve to `fallback` if `p` has not settled within `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function probeHeaders(channel: Pick<LiveChannel, 'url' | 'referer'>): Record<string, string> {
  let referer = channel.referer;
  if (!referer) {
    try {
      referer = new URL(channel.url).origin + '/';
    } catch {
      referer = '';
    }
  }
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };
  if (referer) {
    headers.Referer = referer;
    try {
      headers.Origin = new URL(referer).origin;
    } catch {
      /* ignore malformed referer */
    }
  }
  return headers;
}

interface ProbeResponse {
  status: number;
  ok: boolean;
  body: Response['body'];
}

async function requestOnce(
  channel: Pick<LiveChannel, 'url' | 'referer'>,
  signal: AbortSignal,
  opts: { method?: 'GET' | 'HEAD'; range?: boolean } = {}
): Promise<ProbeResponse> {
  const headers = probeHeaders(channel);
  if (opts.range) headers.Range = 'bytes=0-8191';
  const res = await fetch(channel.url, {
    method: opts.method || 'GET',
    headers,
    cache: 'no-store',
    redirect: 'follow',
    signal,
  });
  return { status: res.status, ok: res.ok, body: res.body };
}

/**
 * Fetch the upstream stream once and decide whether it is serving media.
 * Never throws; anything we cannot determine reports `unknown`.
 */
export async function probeChannel(channel: Pick<LiveChannel, 'url' | 'referer'>): Promise<ChannelStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let lastStatus = 0;

  try {
    // Ranged GET first (cheap), then a plain GET, then HEAD as a last resort.
    const attempts: Array<{ method?: 'GET' | 'HEAD'; range?: boolean }> = [
      { method: 'GET', range: true },
      { method: 'GET' },
      { method: 'HEAD' },
    ];

    for (const attempt of attempts) {
      let res: ProbeResponse;
      try {
        res = await requestOnce(channel, controller.signal, attempt);
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'unknown';
        logger.debug('Channel probe attempt failed', { error: err?.message });
        continue;
      }

      lastStatus = res.status;

      if (GONE_STATUSES.has(res.status)) return 'offline';
      if (BLOCKED_STATUSES.has(res.status)) {
        // Blocked on this egress. Try the next strategy before giving up.
        continue;
      }
      if (!res.ok) continue;

      // 200 (or 206): confirm a real HLS playlist when the URL is one.
      if (!res.body) {
        // HEAD succeeded — treat a reachable, non-erroring endpoint as live.
        return 'live';
      }
      if (!isPlaylistUrl(channel.url)) {
        try {
          await res.body.cancel();
        } catch {
          /* already closed */
        }
        return 'live';
      }

      reader = res.body.getReader();
      const { value } = await reader.read();
      const head = value ? new TextDecoder().decode(value.subarray(0, 1024)) : '';
      await reader.cancel().catch(() => undefined);
      reader = null;
      if (head.includes('#EXTM3U')) return 'live';
      if (head.includes('<html') || head.includes('<!DOCTYPE')) return 'offline';
      // A manifest-ish body we could not read fully: treat as unverified.
      return 'unknown';
    }

    if (lastStatus && !GONE_STATUSES.has(lastStatus)) return 'unknown';
    return lastStatus ? 'offline' : 'unknown';
  } catch (err: any) {
    if (err?.name !== 'AbortError') logger.warn('Channel probe failed', { error: err?.message });
    return 'unknown';
  } finally {
    clearTimeout(timer);
    try {
      await reader?.cancel();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Status for each channel id. Probes run in parallel, cached for
 * PROBE_TTL_S, and a probe still running after PROBE_TIMEOUT_MS is reported as
 * `checking` (it keeps running and fills the cache).
 */
export async function getChannelStatuses(
  channels: LiveChannel[],
  options: { limit?: number } = {}
): Promise<Record<string, ChannelStatus>> {
  const cache = getCacheManager();
  const statuses: Record<string, ChannelStatus> = {};
  const limit = Math.max(0, Math.min(options.limit ?? MAX_PROBES_PER_REQUEST, channels.length));
  const probed = channels.slice(0, limit);

  for (const ch of channels.slice(limit)) statuses[ch.id] = 'unknown';

  await Promise.all(
    probed.map((ch) => {
      const pending = cache.swr<ChannelStatus>(`live_probe_${ch.id}`, () => probeChannel(ch), PROBE_TTL_S);
      return withTimeout(pending, PROBE_TIMEOUT_MS + 500, 'checking' as ChannelStatus).then((s) => {
        statuses[ch.id] = s;
      });
    })
  );

  return statuses;
}
