'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BANNER_728x90,
  BANNER_300x250,
  BANNER_320x50,
  BANNER_728x90_WATCH,
  NATIVE_BANNER,
  bannerFrameHtml,
  nativeBannerFrameHtml,
  socialBarScript,
  AD_REFRESH_INTERVAL_MS,
} from '@/lib/adsConfig';

const BANNER_BY_ID = {
  [BANNER_728x90.id]: BANNER_728x90,
  [BANNER_300x250.id]: BANNER_300x250,
  [BANNER_320x50.id]: BANNER_320x50,
};

const AD_FRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';

let socialBarMounted = false;

/** One Adsterra placement. Renders a deterministic, empty container on the
 * server (hydration-safe) and only injects the third-party code after mount.
 *
 *  - `variant="banner"`  → sized iframe frame running the exact `atOptions`
 *    banner code for `banner` (BANNER_728x90 | BANNER_300x250 | BANNER_320x50).
 *  - `variant="native"`  → iframe frame running the exact native-banner code.
 *  - `variant="social"`  → page-level social-bar script, injected once.
 *  - `variant="banner-refresh"`  → banner with auto-refresh support.
 */
export default function AdSlot({
  variant = 'banner',
  banner = BANNER_728x90,
  className = '',
  label = 'Advertisement',
  refreshMs = AD_REFRESH_INTERVAL_MS,
}) {
  const [mounted, setMounted] = useState(false);
  const socialRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Social bar: one script per document, appended after hydration.
  useEffect(() => {
    if (variant !== 'social' || socialBarMounted) return undefined;
    socialBarMounted = true;
    const script = socialBarScript();
    (socialRef.current || document.body).appendChild(script);
    return () => {
      // The bar itself stays for the document lifetime; only React unmounts.
    };
  }, [variant]);

  if (variant === 'social') {
    return <div ref={socialRef} data-ad-slot="social-bar" hidden aria-hidden="true" />;
  }

  const isBanner = variant === 'banner' || variant === 'banner-refresh';
  const ad = isBanner ? BANNER_BY_ID[banner?.id] ?? banner : NATIVE_BANNER;
  const width = isBanner ? ad.width : undefined;
  const height = isBanner ? ad.height : undefined;

  // Every layer of the slot is pinned to a transparent, dark-scheme canvas:
  // a still-loading or empty ad blends into the #18030A page background
  // instead of flashing a stark white rectangle (see app/globals.css).
  const darkTransparent = { backgroundColor: 'transparent', colorScheme: 'dark' };

  // Auto-refresh support for watch page banner
  const refreshContainerRef = useRef(null);
  useAdRefresh(refreshMs, setMounted);

  return (
    <div
      className={`ad-slot flex w-full max-w-full items-center justify-center overflow-hidden ${className}`}
      style={darkTransparent}
      data-ad-slot={ad.id}
      suppressHydrationWarning
    >
      <div
        className="ad-slot relative overflow-hidden"
        style={isBanner ? { width, height, ...darkTransparent } : { width: '100%', height: 120, ...darkTransparent }}
      >
        {mounted ? (
          <iframe
            title={label}
            srcDoc={isBanner ? bannerFrameHtml(ad) : nativeBannerFrameHtml(ad)}
            sandbox={AD_FRAME_SANDBOX}
            scrolling="no"
            loading="lazy"
            className="ad-slot absolute inset-0 h-full w-full border-0"
            style={darkTransparent}
          />
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </div>
    </div>
  );
}

/** Helper used by AdSlot to toggle mounted state for auto-refresh. */
function useAdRefresh(refreshMs, setMountedRef) {
  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => {
      // Refresh by toggling the mounted state which forces re-mount of the iframe
      setMountedRef((prev) => !prev);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);
}