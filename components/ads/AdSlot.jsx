'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BANNER_728x90,
  BANNER_300x250,
  BANNER_320x50,
  NATIVE_BANNER,
  bannerFrameHtml,
  nativeBannerFrameHtml,
  socialBarScript,
} from '@/lib/adsConfig';

const BANNER_BY_ID = {
  [BANNER_728x90.id]: BANNER_728x90,
  [BANNER_300x250.id]: BANNER_300x250,
  [BANNER_320x50.id]: BANNER_320x50,
};

/**
 * Sandbox for third-party ad frames: scripts and popups are allowed, but the
 * frame stays in an opaque origin, so ad code can never read or mutate the
 * host page and every frame owns its own `atOptions` global (no collisions
 * when several banners render on one page).
 */
const AD_FRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';

let socialBarMounted = false;

/**
 * One Adsterra placement. Renders a deterministic, empty container on the
 * server (hydration-safe) and only injects the third-party code after mount.
 *
 *  - `variant="banner"`  → sized iframe frame running the exact `atOptions`
 *    banner code for `banner` (BANNER_728x90 | BANNER_300x250 | BANNER_320x50).
 *  - `variant="native"`  → iframe frame running the exact native-banner code.
 *  - `variant="social"`  → page-level social-bar script, injected once.
 */
export default function AdSlot({
  variant = 'banner',
  banner = BANNER_728x90,
  className = '',
  label = 'Advertisement',
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

  const isBanner = variant === 'banner';
  const ad = isBanner ? BANNER_BY_ID[banner?.id] ?? banner : NATIVE_BANNER;
  const width = isBanner ? ad.width : undefined;
  const height = isBanner ? ad.height : undefined;

  return (
    <div
      className={`flex w-full max-w-full items-center justify-center overflow-hidden ${className}`}
      data-ad-slot={ad.id}
      suppressHydrationWarning
    >
      <div
        className="relative overflow-hidden"
        style={isBanner ? { width, height } : { width: '100%', height: 120 }}
      >
        {mounted ? (
          <iframe
            title={label}
            srcDoc={isBanner ? bannerFrameHtml(ad) : nativeBannerFrameHtml(ad)}
            sandbox={AD_FRAME_SANDBOX}
            scrolling="no"
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </div>
    </div>
  );
}
