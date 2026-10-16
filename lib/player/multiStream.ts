/**
 * Multi-server stream fallback ("stream1 · stream2 · stream3").
 *
 * Pure and isomorphic so the exact same chain runs in the watch player, in
 * Multi-View tiles, in the stream APIs and in unit tests:
 *
 *  - `buildStreamSlots()` names the first three playable sources of a resolved
 *    stream list `stream1`, `stream2`, `stream3` (the rest become `streamN`).
 *  - `streamsFromSlotMap()` rebuilds a channel list from a payload that carries
 *    bare `stream1`/`stream2`/`stream3` URL fields.
 *  - `isStreamHttpStatusFailure()` decides which HTTP answers mean "this stream
 *    is dead" (404/410/500/502/503/504) so the player can switch seamlessly to
 *    the secondary stream instead of showing a video error.
 *  - `nextFallbackSlot()` walks the chain to the next stream nobody has tried.
 */

/** The named slots every live player accepts as first-class sources. */
export const MULTI_STREAM_SLOTS = ['stream1', 'stream2', 'stream3'] as const;
export type MultiStreamSlotId = (typeof MULTI_STREAM_SLOTS)[number];

/** One named source in the fallback chain. */
export interface StreamSlot {
  /** `stream1`, `stream2`, `stream3`, then `stream4`… for longer lists. */
  slot: string;
  /** Playback URL (signed proxy / redirect link) or null when the slot is empty. */
  url: string | null;
}

/** Minimal shape of the channel objects pages hand to the player. */
export interface SlotSource {
  name?: string;
  url?: string | null;
  proxiedUrl?: string | null;
}

/** Slot id for a 0-based position in the source list. */
export function slotIdForIndex(index: number): string {
  return index < MULTI_STREAM_SLOTS.length
    ? MULTI_STREAM_SLOTS[index]
    : `stream${index + 1}`;
}

/**
 * Names the playable sources of `streams` `stream1`, `stream2`, `stream3`
 * (in order). Sources without a usable URL are skipped, exactly like the
 * player's server list does.
 */
export function buildStreamSlots(streams: SlotSource[] | null | undefined): StreamSlot[] {
  const slots: StreamSlot[] = [];
  for (const source of streams ?? []) {
    const url = source?.proxiedUrl || source?.url || null;
    if (!url) continue;
    slots.push({ slot: slotIdForIndex(slots.length), url });
  }
  return slots;
}

/**
 * The first three slots as a plain record — the shape `/api/streams/[matchId]`
 * and `/api/channels/[id]/streams` expose alongside the full `streams` array.
 */
export function slotMap(streams: SlotSource[] | null | undefined): Record<MultiStreamSlotId, string | null> {
  const bySlot = new Map(buildStreamSlots(streams).map((entry) => [entry.slot, entry.url]));
  return {
    stream1: bySlot.get('stream1') ?? null,
    stream2: bySlot.get('stream2') ?? null,
    stream3: bySlot.get('stream3') ?? null,
  };
}

/**
 * Rebuilds a source list from a payload carrying `stream1`/`stream2`/`stream3`
 * URL fields (undefined/null entries are skipped, order is preserved).
 */
export function streamsFromSlotMap(
  map: Partial<Record<string, string | null | undefined>> | null | undefined
): Array<{ name: string; url: string }> {
  if (!map || typeof map !== 'object') return [];
  return MULTI_STREAM_SLOTS.flatMap((slot) => {
    const url = map[slot];
    return typeof url === 'string' && url ? [{ name: slot, url }] : [];
  });
}

/**
 * HTTP statuses that mean the stream itself is gone/overloaded: the player must
 * fail over to the secondary stream. 401/403/429 are deliberately NOT here —
 * they are usually bot walls in front of a live stream, and failing on them
 * would churn through every server during a perfectly good broadcast.
 */
export function isStreamHttpStatusFailure(status: number | null | undefined): boolean {
  if (typeof status !== 'number' || !Number.isFinite(status)) return false;
  return status === 404 || status === 410 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Human copy for an HTTP failure, used in the switch notice. */
export function describeHttpStatus(status: number | null | undefined): string {
  if (status === 404 || status === 410) return 'Stream returned 404 — feed is gone';
  if (status === 500) return 'Stream returned 500 — server error';
  if (status === 502 || status === 503 || status === 504) return `Stream returned ${status} — gateway unavailable`;
  return 'Stream unavailable';
}

/**
 * Next slot to try after `current` failed: the first slot in chain order that
 * is neither `current` nor listed in `failedSlots`. Returns null once every
 * stream has been tried — that is the moment the tactical radar backup player
 * takes over.
 */
export function nextFallbackSlot(
  slots: StreamSlot[] | null | undefined,
  current: string | null | undefined,
  failedSlots: Iterable<string> | null | undefined
): StreamSlot | null {
  const failed = new Set(failedSlots ?? []);
  for (const entry of slots ?? []) {
    if (entry.slot === current || !entry.url) continue;
    if (failed.has(entry.slot)) continue;
    return entry;
  }
  return null;
}
