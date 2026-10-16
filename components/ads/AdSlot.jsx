'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  BANNER_728x90,
  BANNER_300x250,
  BANNER_320x50,
  BANNER_728x90_WATCH,
  NATIVE_BANNER,
  bannerFrameHtml,
  nativeBannerFrameHtml,
  socialBarFrameHtml,
  AD_REFRESH_INTERVAL_MS,
} from '@/lib/adsConfig';

import { useSubscription } from '@/components/subscription/SubscriptionProvider';
import { trackImpression, trackClick } from '@/lib/analytics/tracker';

const emptySubscribe = () => () => {};

const BANNER_BY_ID = {
  [BANNER_728x90.id]: BANNER_728x90,
  [BANNER_300x250.id]: BANNER_300x250,
  [BANNER_320x50.id]: BANNER_320x50,
};

const AD_FRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';

/** One Adsterra placement. Renders a deterministic, empty container on the
 * server (hydration-safe) and only injects the third-party code after mount.
 *
 *  - `variant="banner"`  → sized iframe frame running the exact `atOptions`
 *    banner code for `banner` (BANNER_728x90 | BANNER_300x250 | BANNER_320x50).
 *  - `variant="native"`  → iframe frame running the exact native-banner code.
 *  - `variant="social"`  → isolated social placement, removed entirely for VIP.
 *  - `variant="banner-refresh"`  → banner with auto-refresh support.
 */
export default function AdSlot({
  variant = 'banner',
  banner = BANNER_728x90,
  className = '',
  label = 'Advertisement',
  refreshMs = AD_REFRESH_INTERVAL_MS,
}) {
  const { access } = useSubscription();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  // Auto-refresh is opt-in (`variant="banner-refresh"`). The nonce remounts the frame
  // so a fresh ad is pulled without ever leaving the slot blank.
  const refreshNonce = useAdRefresh(!access.adFree && variant === 'banner-refresh' ? refreshMs : 0);

  // Hooks stay above every early return; ad identity is computed unconditionally
  // so analytics can mount before the VIP/social branches render.
  const isBanner = variant === 'banner' || variant === 'banner-refresh';
  const ad = isBanner ? BANNER_BY_ID[banner?.id] ?? banner : NATIVE_BANNER;
  const slotId = variant === 'social' ? 'social-bar' : ad.id;

  // Analytics: an impression when the creative mounts; a pointerdown on the
  // slot counts as the click (the frame itself is cross-origin, so the tap is
  // the honest measure — feeds the /mounadel CTR table).
  useEffect(() => {
    if (mounted && !access.adFree) trackImpression(slotId);
  }, [mounted, access.adFree, slotId]);

  if (access.adFree) return null;

  if (variant === 'social') {
    return <div data-ad-slot="social-bar" className="ad-social-frame ad-slot" style={{ backgroundColor: 'transparent', colorScheme: 'dark' }}>
      {mounted && <iframe title={label} srcDoc={socialBarFrameHtml()} sandbox={AD_FRAME_SANDBOX} className="ad-slot h-full w-full border-0" style={{ backgroundColor: 'transparent', colorScheme: 'dark' }} />}
    </div>;
  }

  const width = isBanner ? ad.width : undefined;
  const height = isBanner ? ad.height : undefined;

  // Every layer of the slot is pinned to a transparent, dark-scheme canvas:
  // a still-loading or empty ad blends into the #18030A page background
  // instead of flashing a stark white rectangle (see app/globals.css).
  const darkTransparent = { backgroundColor: 'transparent', colorScheme: 'dark' };

  return (
    <div
      className={`ad-slot flex w-full max-w-full items-center justify-center overflow-hidden ${className}`}
      style={darkTransparent}
      data-ad-slot={ad.id}
      suppressHydrationWarning
      onPointerDown={() => {
        if (mounted) trackClick(slotId);
      }}
    >
      <div
        className="ad-slot relative overflow-hidden"
        style={isBanner ? { width, height, ...darkTransparent } : { width: '100%', height: 120, ...darkTransparent }}
      >
        {mounted ? (
          <iframe
            key={refreshNonce}
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

/** Helper used by AdSlot to auto-refresh: returns a nonce bumped every
 * `refreshMs`, which remounts the ad frame and pulls a new creative. Stays 0
 * (a stable value) when refreshing is disabled. */
function useAdRefresh(refreshMs) {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => setNonce((prev) => prev + 1), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  return nonce;
}