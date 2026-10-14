/**
 * Lightweight "is this channel actually up?" probe used to drive the live
 * status indicators in the UI. Results are cached per channel so repeated
 * page polls do not hammer upstream CDNs.
 */
import logger from '../logger';
import { getCacheManager } from '../cache/cacheManager';
import { isPlaylistUrl } from '../hlsProxy';
import type { ChannelStatus, LiveChannel } from './types';

export const PROBE_TIMEOUT_MS = 4_000;
/** How long a probe result is considered fresh. */
export const PROBE_TTL_S = 60;
/** Upper bound on channels probed per request; the rest report `unknown`. */
export const MAX_PROBES_PER_REQUEST = 60;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

/** Fetch the upstream stream once and decide whether it is serving media. Never throws. */
export async function probeChannel(channel: Pick<LiveChannel, 'url' | 'referer'>): Promise<ChannelStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let body: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_UA,
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      Referer: channel.referer || new URL(channel.url).origin + '/',
    };
    const res = await fetch(channel.url, { headers, cache: 'no-store', signal: controller.signal });
    if (!res.ok || !res.body) return 'offline';

    body = res.body.getReader();
    if (!isPlaylistUrl(channel.url)) return 'live';

    // HLS playlist: a live channel answers with a real #EXTM3U document.
    const { value } = await body.read();
    const head = value ? new TextDecoder().decode(value.subarray(0, 512)) : '';
    return head.includes('#EXTM3U') ? 'live' : 'offline';
  } catch (err: any) {
    if (err?.name !== 'AbortError') logger.warn('Channel probe failed', { error: err?.message });
    return 'offline';
  } finally {
    clearTimeout(timer);
    try {
      await body?.cancel();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Status for each channel id. Probes run in parallel, cached for
 * PROBE_TTL_S, and a probe that is still running after PROBE_TIMEOUT_MS is
 * reported as `checking` (it keeps running and fills the cache).
 */
export async function getChannelStatuses(channels: LiveChannel[]): Promise<Record<string, ChannelStatus>> {
  const cache = getCacheManager();
  const statuses: Record<string, ChannelStatus> = {};
  const probed = channels.slice(0, MAX_PROBES_PER_REQUEST);

  for (const ch of channels.slice(MAX_PROBES_PER_REQUEST)) statuses[ch.id] = 'unknown';

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
