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
