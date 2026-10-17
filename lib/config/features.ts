/**
 * Central feature flags.
 *
 * Live TV (channel listings, channel playback pages, feed-based fallback
 * streams and the IPTV catalogue) is **temporarily hidden** by default.
 * Set `NEXT_PUBLIC_LIVE_TV_ENABLED=true` to re-enable every surface at
 * once — navigation, `/channels`, `/channel/[id]`, `/live-channels`,
 * `/api/live-channels`, channel stream resolution and feed backups in the
 * match player all consult this single predicate, so no surface can leak
 * while the others stay hidden. Nothing is deleted when the flag is off.
 */
export const LIVE_TV_ENV_VAR = 'NEXT_PUBLIC_LIVE_TV_ENABLED';

/** True only when the operator explicitly enables Live TV. */
export function isLiveTvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LIVE_TV_ENABLED === 'true';
}
