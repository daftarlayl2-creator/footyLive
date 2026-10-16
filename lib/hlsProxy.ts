/**
 * HLS proxy helpers.
 *
 * Behaviour modelled on the streaming proxy described in
 * github.com/yowmamasita/live-sports-public:
 *
 *  - Playlist URLs (variants, segments, `#EXT-X-KEY`, `#EXT-X-MAP`, …) are
 *    rewritten to *relative* proxy paths, so once a player has loaded a
 *    playlist the rest of the stream follows whatever host/scheme it arrived on.
 *  - Range requests are forwarded and `206 Partial Content` is returned intact.
 *  - Upstream `Content-Type` is preserved end to end (keys, fMP4 init
 *    segments and WebVTT keep their own types).
 *  - Segments are relayed as they arrive; transfers are bounded by upstream
 *    *silence*, not total duration.
 *
 * On top of that we sign every proxy URL with the project's `STREAM_SECRET`
 * (same convention as `/api/stream-redirect`) so the route cannot be abused
 * as an open proxy.
 */
import crypto from 'crypto';

export const PROXY_PATH = '/api/proxy';

const SECRET_KEY = process.env.STREAM_SECRET || 'default_stream_hmac_secret_key_123_abc';

/** How long a signed proxy URL stays valid. Playlist refreshes mint fresh links. */
export const PROXY_LINK_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface ProxyLinkOptions {
  /** Referer/Origin to present upstream (some CDNs require it). */
  referer?: string;
  /** Signed resolution ceiling, inherited by every variant/segment link. */
  maxHeight?: 720 | 2160;
  /** Absolute epoch-ms expiry. Defaults to now + PROXY_LINK_TTL_MS. */
  expiresAt?: number;
}

/* -------------------------------------------------------------------------- */
/*  Signing                                                                   */
/* -------------------------------------------------------------------------- */

export function signProxyParams(url: string, referer: string, expiresAt: number, maxHeight?: number): string {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${url}|${referer}|${expiresAt}${maxHeight === undefined ? '' : `|h=${maxHeight}`}`)
    .digest('hex');
}

export function verifyProxySignature(
  url: string,
  referer: string,
  expiresAt: number,
  signature: string,
  maxHeight?: number
): boolean {
  if (!signature || !Number.isFinite(expiresAt) || (maxHeight !== undefined && maxHeight !== 720 && maxHeight !== 2160)) return false;
  const expected = signProxyParams(url, referer, expiresAt, maxHeight);
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

/** Build a relative, signed `/api/proxy?...` URL for an absolute upstream URL. */
export function buildProxyUrl(targetUrl: string, opts: ProxyLinkOptions = {}): string {
  const referer = opts.referer || '';
  const expiresAt = opts.expiresAt ?? Date.now() + PROXY_LINK_TTL_MS;
  const sig = signProxyParams(targetUrl, referer, expiresAt, opts.maxHeight);

  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (referer) params.set('ref', referer);
  if (opts.maxHeight !== undefined) params.set('maxHeight', String(opts.maxHeight));
  params.set('exp', String(expiresAt));
  params.set('sig', sig);

  return `${PROXY_PATH}?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */
/*  URL classification / safety                                               */
/* -------------------------------------------------------------------------- */

/** True when the URL looks like something our HLS player should load directly. */
export function isDirectStreamUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') || lower.includes('/hls/') || lower.includes('.mp4');
}

/** True when the URL is an HLS playlist (as opposed to a segment/key). */
export function isPlaylistUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /\.m3u8?$/i.test(pathname);
  } catch {
    return /\.m3u8?(\?|$)/i.test(url);
  }
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80/i,
  /\.internal$/i,
];

/**
 * Set `HLS_PROXY_ALLOW_PRIVATE_HOSTS=true` to let the proxy reach LAN /
 * loopback origins (local testing, self-hosted restreamers). Off by default.
 */
function allowPrivateHosts(): boolean {
  return process.env.HLS_PROXY_ALLOW_PRIVATE_HOSTS === 'true';
}

/**
 * Basic SSRF guard: only http(s) and no loopback / RFC1918 / link-local hosts.
 * Returns the parsed URL on success, `null` otherwise.
 */
export function parseSafeUpstreamUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;

  if (!allowPrivateHosts()) {
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) return null;
  }

  return parsed;
}

/* -------------------------------------------------------------------------- */
/*  Content-type helpers                                                      */
/* -------------------------------------------------------------------------- */

export const HLS_PLAYLIST_MIME = 'application/vnd.apple.mpegurl';

const PLAYLIST_MIME_PATTERNS = ['mpegurl', 'x-mpegurl', 'application/x-mpegurl', 'audio/mpegurl'];

export function isPlaylistContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return PLAYLIST_MIME_PATTERNS.some((p) => lower.includes(p));
}

/** Best-effort content type when upstream doesn't send a usable one. */
export function guessContentType(url: string): string | null {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    /* ignore */
  }
  const ext = pathname.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'm3u8':
    case 'm3u':
      return HLS_PLAYLIST_MIME;
    case 'ts':
      return 'video/mp2t';
    case 'm4s':
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'vtt':
      return 'text/vtt';
    case 'key':
      return 'application/octet-stream';
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Playlist rewriting                                                        */
/* -------------------------------------------------------------------------- */

/** Tags whose attribute list carries a `URI="…"` that must be proxied. */
const URI_ATTRIBUTE_TAGS = [
  '#EXT-X-KEY',
  '#EXT-X-SESSION-KEY',
  '#EXT-X-MAP',
  '#EXT-X-MEDIA',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-PART',
  '#EXT-X-PRELOAD-HINT',
  '#EXT-X-RENDITION-REPORT',
  '#EXT-X-SESSION-DATA',
];

const URI_ATTR_RE = /URI="([^"]*)"/gi;

function shouldSkipUri(uri: string): boolean {
  const lower = uri.trim().toLowerCase();
  return (
    lower === '' ||
    lower.startsWith('data:') ||
    lower.startsWith('skd://') ||
    lower.startsWith('blob:')
  );
}

function resolveAgainst(base: string, uri: string): string | null {
  try {
    return new URL(uri, base).toString();
  } catch {
    return null;
  }
}

/**
 * Rewrite every URI in an HLS playlist so it points back through the proxy.
 *
 * @param playlist  Raw playlist text.
 * @param baseUrl   Absolute URL the playlist was fetched from (after redirects).
 * @param opts      Referer / expiry carried through to the generated links.
 */
export function rewritePlaylist(playlist: string, baseUrl: string, opts: ProxyLinkOptions = {}): string {
  const expiresAt = opts.expiresAt ?? Date.now() + PROXY_LINK_TTL_MS;
  const linkOpts: ProxyLinkOptions = { referer: opts.referer, expiresAt, maxHeight: opts.maxHeight };

  const proxify = (uri: string): string => {
    if (shouldSkipUri(uri)) return uri;
    const absolute = resolveAgainst(baseUrl, uri.trim());
    if (!absolute) return uri;
    if (!parseSafeUpstreamUrl(absolute)) return uri;
    return buildProxyUrl(absolute, linkOpts);
  };

  const lines = limitPlaylistResolution(playlist, opts.maxHeight).split(/\r?\n/);
  const out: string[] = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      out[i] = line;
      continue;
    }

    if (trimmed.startsWith('#')) {
      const upper = trimmed.toUpperCase();
      const hasUriTag = URI_ATTRIBUTE_TAGS.some((tag) => upper.startsWith(tag));
      if (hasUriTag && /URI="/i.test(trimmed)) {
        out[i] = trimmed.replace(URI_ATTR_RE, (_m, uri: string) => `URI="${proxify(uri)}"`);
      } else {
        out[i] = line;
      }
      continue;
    }

    // Anything that isn't a tag or blank is a URI line (segment / variant playlist).
    out[i] = proxify(trimmed);
  }

  return out.join('\n');
}


export class ResolutionLimitError extends Error {
  constructor() { super('No rendition is available within this pass resolution.'); this.name = 'ResolutionLimitError'; }
}

/** Remove premium variants *before* signing their URIs (also covers native HLS in Safari).
 * Unknown-resolution video variants are not silently advertised as free HD.
 * A single media playlist has no rendition metadata; its provider's quality is gated
 * in preparePlayback. This is access control, not DRM for public third-party sources.
 */
export function limitPlaylistResolution(playlist: string, maxHeight?: number): string {
  if (!maxHeight || !/^#EXT-X-STREAM-INF:/im.test(playlist)) return playlist;
  const lines = playlist.split(/\r?\n/);
  const out: string[] = [];
  let keepVariant = true;
  let available = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#EXT-X-STREAM-INF:/i.test(trimmed)) {
      const height = Number(/RESOLUTION=\d+x(\d+)/i.exec(trimmed)?.[1]);
      const audioOnly = /CODECS="(?:mp4a[^",]*|ac-3|ec-3|opus)"/i.test(trimmed);
      keepVariant = height > 0 ? height <= maxHeight : audioOnly || maxHeight >= 2160;
      if (keepVariant) { out.push(line); if (!audioOnly) available++; }
    } else if (/^#EXT-X-I-FRAME-STREAM-INF:/i.test(trimmed)) {
      const height = Number(/RESOLUTION=\d+x(\d+)/i.exec(trimmed)?.[1]);
      if (height > 0 && height <= maxHeight) out.push(line);
    } else if (/^#EXT-X-MEDIA:.*TYPE=VIDEO/i.test(trimmed)) {
      // Alternate video has no resolution metadata and could bypass the ceiling.
      continue;
    } else if (trimmed && !trimmed.startsWith('#')) {
      if (keepVariant) out.push(line);
      keepVariant = true;
    } else out.push(line);
  }
  if (!available) throw new ResolutionLimitError();
  return out.join('\n');
}
