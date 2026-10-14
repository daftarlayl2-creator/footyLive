/**
 * Tolerant JSON feed parser.
 *
 * Accepts either a bare array or an object wrapping one under a common key
 * (`channels`, `events`, `items`, `data`, `streams`, `matches`, `live`).
 * Each item may use any of the common field names below; items without a
 * usable http(s) URL are skipped. Items may also carry a `streams` array, in
 * which case each stream becomes its own entry.
 */
import type { FeedEntry } from './types';
import { safeHost } from './m3u';

const WRAPPER_KEYS = ['channels', 'events', 'items', 'data', 'streams', 'matches', 'live'];

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function refererOf(obj: Record<string, unknown>): string | undefined {
  const direct = pick(obj, ['referer', 'referrer', 'ref']);
  if (direct) return direct;
  const headers = obj.headers;
  if (headers && typeof headers === 'object') {
    return pick(headers as Record<string, unknown>, ['Referer', 'referer', 'Referrer', 'referrer']);
  }
  return undefined;
}

function isHttpUrl(v: string | undefined): v is string {
  return !!v && /^https?:\/\//i.test(v);
}

export function parseJsonFeed(text: string, feedUrl: string): FeedEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }

  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const key = WRAPPER_KEYS.find((k) => Array.isArray(obj[k]));
    if (key) items = obj[key] as unknown[];
  }

  const source = safeHost(feedUrl);
  const out: FeedEntry[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = pick(item, ['name', 'title', 'event', 'channel_name', 'channel']) || 'Live event';
    const logo = pick(item, ['logo', 'tvg_logo', 'tvgLogo', 'image', 'thumbnail', 'poster']);
    const group = pick(item, ['group', 'group_title', 'groupTitle', 'category', 'sport', 'league']);
    const tvgId = pick(item, ['tvg_id', 'tvgId', 'id', 'channel_id']);
    const referer = refererOf(item);

    const base = {
      logo: logo && isHttpUrl(logo) ? logo : undefined,
      group,
      tvgId,
      referer,
      source,
      feedUrl,
    };

    const streams = Array.isArray(item.streams) ? item.streams : null;
    if (streams) {
      streams.forEach((s, idx) => {
        if (typeof s === 'string') {
          if (isHttpUrl(s)) out.push({ ...base, name: `${name} (${idx + 1})`, url: s });
          return;
        }
        if (s && typeof s === 'object') {
          const so = s as Record<string, unknown>;
          const url = pick(so, ['url', 'stream', 'src', 'link']);
          if (isHttpUrl(url)) {
            out.push({
              ...base,
              referer: refererOf(so) ?? referer,
              name: pick(so, ['name', 'title']) || `${name} (${idx + 1})`,
              url,
            });
          }
        }
      });
      continue;
    }

    const url = pick(item, ['url', 'stream', 'stream_url', 'streamUrl', 'link', 'src', 'hls']);
    if (isHttpUrl(url)) out.push({ ...base, name, url });
  }

  return out;
}
