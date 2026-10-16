'use client';

/**
 * Smart device detection for adaptive chrome (notification tray, sheets, TV).
 *
 * Returns one of:
 *   - 'mobile'  → up to the `sm` breakpoint (639px): full-screen sheets/modals.
 *   - 'tablet'  → `sm` up to `lg` (640–1023px): compact anchored popovers.
 *   - 'desktop' → `lg` and up on a desktop UA: popovers + hover affordances.
 *   - 'tv'      → Smart-TV / set-top user agents (Tizen, webOS, Android TV…):
 *                 anything mounted in a 10-foot UI gets the large-screen layout.
 *
 * Layout itself is CSS-breakpoint driven (the same markup reflows at sm/lg/2xl),
 * so this hook only drives *behaviour* (scroll lock, portal layer, data-device
 * QA hooks). It is SSR-safe: the first render always says 'desktop' to match the
 * server, and the real kind is resolved in an effect — never a hydration trap.
 */
import { useEffect, useState } from 'react';

/** Smart TVs, streaming sticks and consoles embed full browsers — catch them by UA. */
const TV_USER_AGENT = /Smart[_ -]?TV|SMART-TV|Tizen|Web0S|WebOS|GoogleTV|CrKey|Android[ _-]?TV|AppleTV|Apple TV|FireTV|HbbTV|NetCast|BRAVIA|Viera|Roku|AFT[BCS]/i;

export function detectDeviceKind(width = typeof window === 'undefined' ? 1280 : window.innerWidth, userAgent = typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '')) {
  if (userAgent && TV_USER_AGENT.test(userAgent)) return 'tv';
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export default function useDeviceKind() {
  // 'desktop' matches the SSR markup; corrected after mount, post-hydration.
  const [kind, setKind] = useState('desktop');

  useEffect(() => {
    const update = () => setKind(detectDeviceKind());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return kind;
}
