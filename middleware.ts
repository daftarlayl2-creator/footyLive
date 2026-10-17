import { NextResponse, type NextRequest } from 'next/server';
import { isLiveTvEnabled } from '@/lib/config/features';

/**
 * Phase 13 (Task 1) + IPTV follow-up: give hidden Live TV playback pages a
 * real HTTP 404.
 *
 * `app/channel/[id]/page.js` and `app/iptv/[id]/page.jsx` already call
 * `notFound()` while the flag is off, but the root `app/loading.js` streams
 * the shell first, so production answered 200 with a not-found body (a
 * soft-404). This middleware runs before any rendering: while Live TV is
 * disabled it rewrites playback-page requests to an intentionally unmatched
 * internal path, so Next serves its standard not-found response with a
 * genuine 404 status — the visible URL (rewrite, not redirect) and page
 * chrome are unchanged. The page-level `notFound()` stays as
 * defense-in-depth. When the flag is on, requests pass through untouched
 * and valid channel/IPTV routes resolve exactly as before.
 */
export function middleware(request: NextRequest) {
  if (!isLiveTvEnabled()) {
    const url = request.nextUrl.clone();
    url.pathname = '/__live-tv-disabled-404';
    url.search = '';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Playback pages only — NOT `/channels` or `/live-channels` (the list
  // pages render their own honest unavailable states with a 200, by design).
  matcher: ['/channel/:path*', '/iptv/:path*'],
};
