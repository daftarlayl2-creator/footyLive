/**
 * Minimal, tolerant M3U / M3U8 playlist parser.
 *
 * Handles the variants seen in IPTV aggregator playlists:
 *  - `#EXTINF:-1 tvg-id="…" tvg-logo="…" group-title="…",Title`
 *    (attribute values may contain commas inside quotes)
 *  - `#EXTVLCOPT:http-referrer=…` / `http-referer` headers applying to the next URL
 *  - `#EXTHTTP:{"Referer":"…"}` JSON headers applying to the next URL
 *  - bare URL lines with no preceding `#EXTINF` (title falls back to the path)
 */
import type { FeedEntry } from './types';

const ATTR_RE = /([A-Za-z0-9_-]+)="([^"]*)"/g;

/** Split an `#EXTINF` payload into its attribute section and title, honouring quotes. */
export function splitExtinfPayload(payload: string): { attrs: string; title: string } {
  let inQuotes = false;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      return { attrs: payload.slice(0, i), title: payload.slice(i + 1).trim() };
    }
  }
  return { attrs: payload, title: '' };
}

export function parseExtinfAttributes(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of attrs.matchAll(ATTR_RE)) {
    out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function refererFromExtHttp(json: string): string | undefined {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === 'referer' || key.toLowerCase() === 'referrer') {
        const v = obj[key];
        if (typeof v === 'string' && v) return v;
      }
    }
  } catch {
    /* not JSON — ignore */
  }
  return undefined;
}

function fallbackTitle(url: string): string {
  try {
    const { pathname, hostname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop() || hostname;
    return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return url;
  }
}

/**
 * Parse an M3U playlist into feed entries. Entries without an http(s) URL are
 * dropped. `feedUrl` is recorded on every entry for provenance.
 */
export function parseM3U(text: string, feedUrl: string): FeedEntry[] {
  const source = safeHost(feedUrl);
  const entries: FeedEntry[] = [];

  let pending: { attrs: Record<string, string>; title: string } | null = null;
  let pendingReferer: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const payload = line.slice('#EXTINF'.length).replace(/^:/, '');
      const { attrs, title } = splitExtinfPayload(payload);
      pending = { attrs: parseExtinfAttributes(attrs), title };
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      const [key, ...rest] = line.slice('#EXTVLCOPT:'.length).split('=');
      const value = rest.join('=').trim();
      const k = key.trim().toLowerCase();
      if ((k === 'http-referrer' || k === 'http-referer') && value) pendingReferer = value;
      continue;
    }

    if (line.startsWith('#EXTHTTP:')) {
      pendingReferer = refererFromExtHttp(line.slice('#EXTHTTP:'.length).trim()) ?? pendingReferer;
      continue;
    }

    if (line.startsWith('#')) continue; // other directives (#EXTM3U, #KODIPROP, …)

    // URL line
    if (!/^https?:\/\//i.test(line)) {
      pending = null;
      pendingReferer = undefined;
      continue;
    }

    const attrs = pending?.attrs ?? {};
    const title = pending?.title || fallbackTitle(line);
    entries.push({
      name: title,
      url: line,
      logo: attrs['tvg-logo'] || undefined,
      group: attrs['group-title'] || undefined,
      tvgId: attrs['tvg-id'] || undefined,
      referer: pendingReferer,
      source,
      feedUrl,
    });
    pending = null;
    pendingReferer = undefined;
  }

  return entries;
}

export function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
