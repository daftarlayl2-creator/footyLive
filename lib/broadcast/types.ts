/**
 * Shared types for dynamic live channel / event feeds (M3U or JSON playlists).
 */

/** One entry as it appeared in an upstream feed, normalised. */
export interface FeedEntry {
  /** Human title of the event / channel, e.g. "LASK vs Liverpool - 14 Oct 2026". */
  name: string;
  /** Absolute upstream stream URL (HLS playlist, MP4, …). */
  url: string;
  /** Optional logo / poster image. */
  logo?: string;
  /** Group / category (e.g. "Football"). */
  group?: string;
  /** Stable identifier from the feed (tvg-id, id, …) if provided. */
  tvgId?: string;
  /** Additional channel/event aliases from tvg-name or JSON tags. */
  tags?: string[];
  /** Parent fixture title retained when a nested stream is named only HD/FHD. */
  matchTitle?: string;
  quality?: string;
  /** Referer the upstream expects (from #EXTVLCOPT / #EXTHTTP / JSON headers). */
  referer?: string;
  /** Hostname of the feed the entry came from (for display only). */
  source: string;
  /** URL of the feed the entry came from. */
  feedUrl: string;
}

export type ChannelStatus = 'live' | 'offline' | 'checking' | 'unknown';

/** A feed entry that is safe to play through `/api/proxy`. */
export interface LiveChannel extends FeedEntry {
  /** Stable id derived from feed + tvg-id/name (survives token rotation in URLs). */
  id: string;
}
