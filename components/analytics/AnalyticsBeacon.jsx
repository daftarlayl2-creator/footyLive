'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { startAnalytics, trackPageview } from '@/lib/analytics/tracker';

/**
 * Invisible beacon mounted once in the root layout: heartbeats mark the visit
 * as live for the /mounadel command center, and every route change records a
 * pageview. Renders nothing.
 */
export default function AnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => startAnalytics(), []);

  // Route changes after the initial one (startAnalytics records the first).
  useEffect(() => {
    trackPageview(pathname || '/');
  }, [pathname]);

  return null;
}
