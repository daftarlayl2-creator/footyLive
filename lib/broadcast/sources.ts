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

export function isGuovinFeed(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return url.hostname === 'guovin.github.io' && /^\/iptv-api\/(result|ipv4|ipv6)\.m3u$/.test(url.pathname);
  } catch {
    return false;
  }
}
