/** Canonical provenance for the official IPTV-Org sports category. */
export const IPTV_ORG_SPORTS_URL = 'https://iptv-org.github.io/iptv/categories/sports.m3u';
export const IPTV_ORG_SPORTS_API = 'https://api.github.com/repos/iptv-org/iptv/contents/categories/sports.m3u?ref=gh-pages';

/** The Pages index and its published gh-pages file are the same upstream data. */
export function canonicalFeedUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return value;
    if (url.hostname === 'iptv-org.github.io' && url.pathname === '/iptv/categories/sports.m3u') return IPTV_ORG_SPORTS_URL;
    if (url.hostname === 'raw.githubusercontent.com' && url.pathname === '/iptv-org/iptv/gh-pages/categories/sports.m3u') return IPTV_ORG_SPORTS_URL;
    if (url.hostname === 'api.github.com' && url.pathname === '/repos/iptv-org/iptv/contents/categories/sports.m3u' && url.searchParams.get('ref') === 'gh-pages') return IPTV_ORG_SPORTS_URL;
    if (url.hostname === 'github.com' && /^\/iptv-org\/iptv\/(blob|raw)\/gh-pages\/categories\/sports\.m3u$/.test(url.pathname)) return IPTV_ORG_SPORTS_URL;
  } catch { /* Leave other configured sources unchanged. */ }
  return value;
}

export function isIptvOrgFeed(value: string): boolean {
  return canonicalFeedUrl(value) === IPTV_ORG_SPORTS_URL;
}

/** Canonical provenance for the Guovin IPTV-API complete playlist. */
export const GUOVIN_IPTV_API_URL = 'https://guovin.github.io/iptv-api/result.m3u';
export const GUOVIN_IPTV_API_IPV4_URL = 'https://guovin.github.io/iptv-api/ipv4.m3u';
export const GUOVIN_IPTV_API_IPV6_URL = 'https://guovin.github.io/iptv-api/ipv6.m3u';

/** Aliases for callers/tests that use alternate naming. */
export const GUOVIN_RESULT_M3U_URL = GUOVIN_IPTV_API_URL;
export const GUOVIN_IPV4_M3U_URL = GUOVIN_IPTV_API_IPV4_URL;
export const GUOVIN_IPV6_M3U_URL = GUOVIN_IPTV_API_IPV6_URL;

/** Newest-first releases; each manual generation run publishes `playlist-*` assets. */
export const GUOVIN_RELEASES_API = 'https://api.github.com/repos/Guovin/iptv-api/releases?per_page=6';

export type GuovinVariant = 'result' | 'ipv4' | 'ipv6';

/**
 * Which Guovin playlist variant a URL points at, for every transport that
 * serves the same generated file: GitHub Pages, the `gd` output branch
 * (raw / blob / Contents API) and the `playlist-*` release assets.
 */
export function guovinVariant(value: string): GuovinVariant | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const path = url.pathname;
    let match: RegExpExecArray | null = null;
    if (url.hostname === 'guovin.github.io') match = /^\/iptv-api\/(result|ipv4|ipv6)\.m3u$/.exec(path);
    else if (url.hostname === 'raw.githubusercontent.com') match = /^\/Guovin\/iptv-api\/(?:refs\/heads\/)?[\w.-]+\/output\/(?:(ipv4|ipv6)\/)?result\.m3u$/i.exec(path);
    else if (url.hostname === 'api.github.com') match = /^\/repos\/Guovin\/iptv-api\/contents\/output\/(?:(ipv4|ipv6)\/)?result\.m3u$/i.exec(path);
    else if (url.hostname === 'github.com') {
      match = /^\/Guovin\/iptv-api\/releases\/download\/[\w.-]+\/(result|ipv4|ipv6)\.m3u$/i.exec(path) ??
        /^\/Guovin\/iptv-api\/(?:blob|raw)\/[\w.-]+\/output\/(?:(ipv4|ipv6)\/)?result\.m3u$/i.exec(path);
    }
    if (!match) return null;
    return ((match[1] || 'result').toLowerCase()) as GuovinVariant;
  } catch {
    return null;
  }
}

export function isGuovinFeed(value: string): boolean {
  return guovinVariant(value) !== null;
}

/** The same variant on the generator's `gd` output branch (stale-tolerant last resort). */
export function guovinContentsApiUrl(variant: GuovinVariant): string {
  const file = variant === 'result' ? 'output/result.m3u' : `output/${variant}/result.m3u`;
  return `https://api.github.com/repos/Guovin/iptv-api/contents/${file}?ref=gd`;
}

/** Built-in 24/7 channels used only when every configured feed is down. */
export const STANDBY_FEED_URL = 'eviv://standby';

export function isStandbyFeed(value: string): boolean {
  return value === STANDBY_FEED_URL;
}

/** Compatibility aliases for alternate naming used by callers/tests. */
export const GUOVIN_FEED_URL = GUOVIN_IPTV_API_URL;
export const GUOVIN_IPTV_API = GUOVIN_IPTV_API_URL;
export const GUOVIN_RESULT_URL = GUOVIN_IPTV_API_URL;
export const GUOVIN_RESULT_M3U = GUOVIN_IPTV_API_URL;
export const GUOVIN_M3U_URL = GUOVIN_IPTV_API_URL;
export function isGuovinIptvApi(value: string): boolean { return isGuovinFeed(value); }
export function isGuovinSource(value: string): boolean { return isGuovinFeed(value); }
