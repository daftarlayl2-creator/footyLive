import { NextResponse, type NextRequest } from 'next/server';
import { isLiveTvEnabled } from '@/lib/config/features';

/**
 * Phase 13 (Task 1): give hidden Live TV channel pages a real HTTP 404.
 *
 * `app/channel/[id]/page.js` already calls `notFound()` while the flag is
 * off, but the root `app/loading.js` streams the shell first, so production
 * answered 200 with a not-found body (a soft-404). This middleware runs
 * before any rendering: while Live TV is disabled it rewrites channel-page
 * requests to an intentionally unmatched internal path, so Next serves its
 * standard not-found response with a genuine 404 status — the visible URL
 * (rewrite, not redirect) and page chrome are unchanged. The page-level
 * `notFound()` stays as defense-in-depth. When the flag is on, requests
 * pass through untouched and valid channel routes resolve exactly as before.
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
  // Channel playback pages only — NOT `/channels` (the list page renders its
  // own honest unavailable state with a 200, by design).
  matcher: ['/channel/:path*'],
};
