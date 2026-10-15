/**
 * Embedded (iframe) player helpers shared by <StreamPlayer>, the multistream
 * grid and the highlight modal.
 *
 * Provider players refuse to run inside a `sandbox`ed frame (they detect the
 * missing `allow-*` tokens and show "Remove sandbox attributes on the iframe
 * tag"), so video frames are never sandboxed. They get a permissive `allow`
 * list instead, and failures are detected from the outside:
 *
 *  - `classifyFrameLocation()` reads the frame location after `load`. A
 *    cross-origin location (unreadable) means the provider page loaded; a
 *    readable same-origin `/api/…` location means our signed redirect refused
 *    the link (expired / invalid) and the frame is showing an error page.
 *  - The redirect endpoint answers `?check=1` with a server-side probe of the
 *    provider page (`EmbedHealth`), so dead provider links fail over fast.
 *
 * Pure and isomorphic: no DOM access beyond the values passed in.
 */

/** Permissive feature policy for third-party video players (no sandbox). */
export const EMBED_IFRAME_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';

/** Referrer policy that keeps provider hotlink checks happy without leaking full URLs. */
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin';

export type EmbedHealth = 'ok' | 'offline' | 'unknown';

export type FrameLoadState =
  /** Cross-origin provider page (the normal, healthy case). */
  | 'loaded'
  /** Still on the initial about:blank document (load fired before navigation). */
  | 'blank'
  /** Our own endpoint answered with an error page instead of redirecting. */
  | 'refused';

/**
 * Classifies an iframe after its `load` event.
 *
 * @param href  `frame.contentWindow.location.href`, or `null` when reading it
 *              threw (cross-origin document).
 * @param origin  The embedding page's origin (`window.location.origin`).
 */
export function classifyFrameLocation(href: string | null | undefined, origin: string): FrameLoadState {
  if (href === null || href === undefined) return 'loaded';
  if (href === '' || href === 'about:blank') return 'blank';
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return 'loaded';
  }
  if (url.origin !== origin) return 'loaded';
  // A same-origin document is only an error when it is one of our API endpoints
  // (the redirect route renders its refusal page there).
  return url.pathname.startsWith('/api/') ? 'refused' : 'loaded';
}

/** Reads an iframe's location for `classifyFrameLocation` (null when cross-origin). */
export function readFrameHref(frame: { contentWindow?: { location?: { href?: string } } | null } | null): string | null {
  try {
    const href = frame?.contentWindow?.location?.href;
    return typeof href === 'string' ? href : null;
  } catch {
    return null;
  }
}

/** Health-check URL for one of our signed redirect links, or null for other URLs. */
export function embedCheckUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/api/stream-redirect?')) return null;
  return `${url}&check=1`;
}

/**
 * Maps an upstream HTTP status from the provider page probe:
 * 404/410 → offline (the page is gone); 2xx/3xx → ok; anything else
 * (401/403/429/5xx, bot walls) → unknown, which never fails a server.
 */
export function classifyEmbedStatus(status: number): EmbedHealth {
  if (status === 404 || status === 410) return 'offline';
  if (status >= 200 && status < 400) return 'ok';
  return 'unknown';
}

/**
 * Removes `sandbox` attributes from `<iframe>` tags in provider embed HTML and
 * makes sure each frame gets the permissive `allow` list and fullscreen.
 * Only `<iframe …>` start tags are rewritten; everything else is untouched.
 */
export function stripIframeSandbox(html: string | null | undefined): string {
  if (!html) return '';
  return String(html).replace(/<iframe\b[^>]*>/gi, (tag) => {
    let next = tag
      // sandbox, sandbox="…", sandbox='…', sandbox=value
      .replace(/\s+sandbox(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s/>])/gi, '');
    if (!/\sallow\s*=/i.test(next)) next = next.replace(/<iframe\b/i, `<iframe allow="${EMBED_IFRAME_ALLOW}"`);
    if (!/\sallowfullscreen\b/i.test(next)) next = next.replace(/<iframe\b/i, '<iframe allowfullscreen');
    return next;
  });
}
