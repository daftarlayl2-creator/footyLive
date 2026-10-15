/** Tolerant extended-M3U parser for channel indexes, not media segments. */
import type { FeedEntry } from './types';
import { inferStreamQuality } from './matching';
import { canonicalFeedUrl } from './sources';

const ATTR_RE = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"']+))/g;

/** Split at the first unquoted comma; quoted titles/logos may contain commas. */
export function splitExtinfPayload(payload: string): { attrs: string; title: string } {
  let quote = '';
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    if (ch === '\\' && quote) { i++; continue; }
    if ((ch === '"' || ch === "'") && (!quote || quote === ch)) quote = quote ? '' : ch;
    else if (ch === ',' && !quote) return { attrs: payload.slice(0, i), title: payload.slice(i + 1).trim() };
  }
  return { attrs: payload, title: '' };
}

export function parseExtinfAttributes(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of attrs.matchAll(ATTR_RE)) {
    out[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4]).replace(/\\(["'\\])/g, '$1');
  }
  return out;
}

function httpUrl(value: string | undefined, base?: string): string | undefined {
  if (!value || value.length > 8192) return undefined;
  try {
    const url = new URL(value.replace(/&amp;/g, '&'), base);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function refererFromExtHttp(json: string): string | undefined {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    for (const [key, value] of Object.entries(obj)) {
      if (/^referr?er$/i.test(key) && typeof value === 'string') return httpUrl(value);
    }
  } catch { /* ignore invalid optional headers */ }
  return undefined;
}

function fallbackTitle(url: string): string {
  try {
    const { pathname, hostname } = new URL(url);
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || hostname).replace(/\.[a-z0-9]+$/i, '');
  } catch { return 'Live channel'; }
}

export function parseM3U(text: string, feedUrl: string): FeedEntry[] {
  const provenance = canonicalFeedUrl(feedUrl);
  const source = safeHost(provenance);
  const entries: FeedEntry[] = [];
  let pending: { attrs: Record<string, string>; title: string } | null = null;
  let pendingReferer: string | undefined;
  let pendingGroup: string | undefined;

  for (const rawLine of text.split(/\r\n?|\n/)) {
    if (rawLine.length > 16_384) { pending = null; pendingReferer = undefined; pendingGroup = undefined; continue; }
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line) continue;
    if (/^#EXTINF\s*:/i.test(line)) {
      const { attrs, title } = splitExtinfPayload(line.replace(/^#EXTINF\s*:/i, ''));
      if (pending) pendingGroup = undefined;
      pending = { attrs: parseExtinfAttributes(attrs), title: title.slice(0, 512) };
      // An orphaned entry must not leak headers to the next channel.
      pendingReferer = undefined;
      continue;
    }
    if (/^#EXTGRP:/i.test(line)) { pendingGroup = line.slice(line.indexOf(':') + 1).trim().slice(0, 256); continue; }
    if (/^#EXTVLCOPT:/i.test(line)) {
      const [key, ...rest] = line.slice(line.indexOf(':') + 1).split('=');
      if (/^http-referr?er$/i.test(key.trim())) pendingReferer = httpUrl(rest.join('=').trim());
      continue;
    }
    if (/^#EXTHTTP:/i.test(line)) { pendingReferer = refererFromExtHttp(line.slice(line.indexOf(':') + 1).trim()) ?? pendingReferer; continue; }
    if (line.startsWith('#')) continue;

    // Kodi/VLC URL-suffixed headers are not part of a signed media URL. Only
    // the Referer hint is supported; cookies and arbitrary headers are ignored.
    const [rawUrl, headers] = line.split(/\|(?=[\w-]+=)/, 2);
    const url = /^https?:\/\//i.test(rawUrl) ? httpUrl(rawUrl) : undefined;
    if (url) {
      const attrs = pending?.attrs ?? {};
      const group = (attrs['group-title'] || pendingGroup)?.slice(0, 256);
      const name = pending?.title || attrs['tvg-name'] || fallbackTitle(url);
      const urlHeaders = new URLSearchParams(headers);
      const headerRef = [...urlHeaders].find(([key]) => /^referr?er$/i.test(key))?.[1];
      const tags = [...new Set([attrs['tvg-name'], ...(group?.split(/[;|]/) ?? [])].filter(Boolean).map((tag) => tag.trim().slice(0, 160)))];
      entries.push({
        name: name.slice(0, 512), url,
        // Preserve the upstream high-resolution logo verbatim; never invent a
        // bigger image or discard SVG/retina query parameters.
        logo: httpUrl(attrs['tvg-logo'], provenance), group,
        tvgId: attrs['tvg-id']?.slice(0, 160) || undefined,
        tags: tags.length ? tags : undefined,
        quality: inferStreamQuality(name, attrs.quality, attrs['tvg-id']),
        referer: httpUrl(headerRef) ?? pendingReferer ?? httpUrl(attrs['http-referrer'] ?? attrs['http-referer']),
        source, feedUrl: provenance,
      });
    }
    pending = null; pendingReferer = undefined; pendingGroup = undefined;
  }
  return entries;
}

export function safeHost(url: string): string {
  try { return new URL(url).hostname; } catch { return 'unknown'; }
}
