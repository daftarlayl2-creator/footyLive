import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, middleware } from '../../middleware';

/**
 * Phase 13 (Task 1): the soft-404 fix. Unit level: the middleware must turn
 * hidden channel pages into the standard not-found response while the flag
 * is off, and stay completely out of the way while it is on. (The actual
 * HTTP 404 status is verified against clean production builds — see the
 * Phase 13 entry in docs/engineering-log.md.)
 */
const channelRequest = () => new NextRequest('https://limon.example/channel/bein-sports-1?quality=hd');

describe('Live TV channel middleware', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rewrites channel pages to the unmatched 404 path while Live TV is disabled (default)', () => {
    const response = middleware(channelRequest());
    const rewrite = response.headers.get('x-middleware-rewrite');
    expect(rewrite).toBeTruthy();
    expect(new URL(rewrite!).pathname).toBe('/__live-tv-disabled-404');
    // A rewrite (not a redirect): the viewer keeps the /channel/<id> URL.
    expect(response.headers.get('location')).toBeNull();
  });

  it('treats any value other than exact "true" as disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', '1');
    expect(middleware(channelRequest()).headers.get('x-middleware-rewrite')).toBeTruthy();
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'yes');
    expect(middleware(channelRequest()).headers.get('x-middleware-rewrite')).toBeTruthy();
  });

  it('passes channel pages through untouched while Live TV is enabled', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    const response = middleware(channelRequest());
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('is scoped to channel playback pages only (never /channels or assets)', () => {
    expect(config.matcher).toEqual(['/channel/:path*']);
  });
});
