/**
 * Central Adsterra monetization configuration.
 *
 * Every value here is copied verbatim from the Adsterra dashboard ad codes —
 * keys, sizes and script URLs must never be edited by hand. Components read
 * from this module through `components/ads/AdSlot.jsx`, which executes the
 * third-party scripts inside isolated sandboxed frames so that:
 *
 *  - SSR / hydration output stays deterministic (no hydration errors), and
 *  - multiple banners on one page never collide over the global `atOptions`
 *    object (each banner frame owns its own `atOptions` object).
 */

/** Cloudflare Rocket Loader bypass attribute used by several Adsterra tags. */
export const CFASYNC_ATTR = { 'data-cfasync': 'false' };

/**
 * Ad refresh interval in milliseconds (60 seconds).
 * Used by the watch page banner to auto-refresh and boost CPM revenue. */
export const AD_REFRESH_INTERVAL_MS = 60_000;

/** Social Bar (unit 14) — a page-level overlay script. Injected exactly once
 * into the document body by `AdSlot variant="social"`. */
export const SOCIAL_BAR = {
  id: 'social-bar',
  src: 'https://czernik.org/14/283b6d90f1b8eeadb1b8dda2d0849761',
};

/** Native Banner (unit 21) — renders into its own `container-…` div. Safe to
 * mount several times: every instance runs inside its own frame, so the fixed
 * container id never collides. */
export const NATIVE_BANNER = {
  id: 'native-banner',
  src: 'https://czernik.org/21/44ce743f3b5a54566aace2ec1430ba23',
  containerId: 'container-44ce743f3b5a54566aace2ec1430ba23',
};

/** Iframe banner (unit 22) placements, keyed by the Adsterra `atOptions` key. */
export const BANNER_728x90 = {
  id: 'banner-728x90',
  key: 'a2c14b4291560308f915ce8a1b17c971',
  src: 'https://czernik.org/22/a2c14b4291560308f915ce8a1b17c971',
  format: 'iframe',
  width: 728,
  height: 90,
};

export const BANNER_300x250 = {
  id: 'banner-300x250',
  key: 'a47aaccbd50d51243882c1ce3818575d',
  src: 'https://czernik.org/22/a47aaccbd50d51243882c1ce3818575d',
  format: 'iframe',
  width: 300,
  height: 250,
};

export const BANNER_320x50 = {
  id: 'banner-320x50',
  key: '32b55c2af4a907dab8cad75ae1fcfa3d',
  src: 'https://czernik.org/22/32b55c2af4a907dab8cad75ae1fcfa3d',
  format: 'iframe',
  width: 320,
  height: 50,
};

/** Watch page top banner placement (728x90) — supports auto-refresh. */
export const BANNER_728x90_WATCH = {
  id: 'banner-728x90-watch',
  key: 'a2c14b4291560308f915ce8a1b17c971',
  src: 'https://czernik.org/22/a2c14b4291560308f915ce8a1b17c971',
  format: 'iframe',
  width: 728,
  height: 90,
};

/** Named placements used across the app. */
export const AD_PLACEMENTS = {
  socialBar: SOCIAL_BAR,
  homeTopDesktop: BANNER_728x90,
  homeTopMobile: BANNER_320x50,
  mobileStickyFooter: BANNER_320x50,
  feedNative: NATIVE_BANNER,
  highlightsNative: NATIVE_BANNER,
  watchBelowPlayer: BANNER_728x90,
  watchSidebar: BANNER_300x250,
  watchTopBanner: BANNER_728x90_WATCH,
  /** Footer leaderboard (Phase 6): same network unit, distinct placement id
   * so impressions are counted per slot. */
  footerLeaderboard: BANNER_728x90,
  footerMobile: BANNER_320x50,
};

/** All banner configs by id. */
export const BANNERS = {
  [BANNER_728x90.id]: BANNER_728x90,
  [BANNER_300x250.id]: BANNER_300x250,
  [BANNER_320x50.id]: BANNER_320x50,
  [BANNER_728x90_WATCH.id]: BANNER_728x90_WATCH,
};

/**
 * The exact `atOptions` script block from the Adsterra banner code.
 * Each banner frame defines its own `atOptions` on its own window.
 */
export function bannerAtOptionsScript(banner) {
  return `<script type="text/javascript">
  atOptions = {
    'key' : '${banner.key}',
    'format' : '${banner.format}',
    'height' : ${banner.height},
    'width' : ${banner.width},
    'params' : {}
  };</script>`;
}

/** The exact invoke script tag from the Adsterra banner code. */
export function bannerInvokeScript(banner) {
  return `<script type="text/javascript" src="${banner.src}"></script>`;
}

/**
 * Dark-theme guard injected into every ad frame document. Ad frames must
 * never paint a stark white rectangle — not while loading, not when a slot
 * ends up empty. The frame canvas stays transparent with a dark colour
 * scheme, so an empty ad blends straight into the burgundy page behind it.
 */
const AD_FRAME_DARK_HEAD = [
  '<head><meta charset="utf-8"><meta name="color-scheme" content="dark">',
  '<style>',
  'html,body{margin:0;padding:0;overflow:hidden;background:transparent!important;color-scheme:dark;}',
  'iframe,ins{border:0;background:transparent!important;color-scheme:dark;}',
  '</style></head>',
].join('');

/**
 * Full document executed inside a banner's isolated frame. The exact Adsterra
 * code runs unchanged — only the surrounding document is ours (and it is
 * pinned to a transparent, dark-scheme canvas).
 */
export function bannerFrameHtml(banner) {
  return [
    '<!doctype html><html>',
    AD_FRAME_DARK_HEAD,
    '<body style="margin:0;overflow:hidden;background:transparent!important;color-scheme:dark">',
    bannerAtOptionsScript(banner),
    bannerInvokeScript(banner),
    '</body></html>',
  ].join('\n');
}

/** The exact native-banner code (script + container div) for its isolated frame. */
export function nativeBannerFrameHtml(ad = NATIVE_BANNER) {
  return [
    '<!doctype html><html>',
    AD_FRAME_DARK_HEAD,
    '<body style="margin:0;overflow:hidden;background:transparent!important;color-scheme:dark">',
    `<script async="async" data-cfasync="false" src="${ad.src}"></script>`,
    `<div id="${ad.containerId}"></div>`,
    '</body></html>',
  ].join('\n');
}

/** Isolated social placement: the complete document is removed when VIP activates. */
export function socialBarFrameHtml(ad = SOCIAL_BAR) {
  return [
    '<!doctype html><html>', AD_FRAME_DARK_HEAD,
    '<body style="margin:0;overflow:hidden;background:transparent!important;color-scheme:dark">',
    `<script data-cfasync="false" src="${ad.src}"></script>`,
    '</body></html>',
  ].join('\n');
}

/** The exact social-bar script tag, created once per document. */
export function socialBarScript(ad = SOCIAL_BAR) {
  const script = document.createElement('script');
  script.setAttribute('data-cfasync', 'false');
  script.src = ad.src;
  script.async = false;
  return script;
}

/** Default export object keeping the same shape for backward compatibility. */
const adsConfig = {
  SOCIAL_BAR,
  NATIVE_BANNER,
  BANNER_728x90,
  BANNER_300x250,
  BANNER_320x50,
  BANNER_728x90_WATCH,
  AD_PLACEMENTS,
  BANNERS,
  AD_REFRESH_INTERVAL_MS,
};

export default adsConfig;