/**
 * Pure helpers for the manual live-channel list on the watch page.
 *
 * The watch page shows every channel of the aggregated feeds next to the match
 * servers, so a viewer can switch instantly when a stream is offline — no dead
 * end. Rows are normalised defensively: a malformed upstream entry is dropped,
 * never rendered half-built.
 */

export interface ChannelRow {
  id: string;
  name: string;
  group: string;
  logo: string;
  source: string;
  status: 'live' | 'unknown' | 'offline';
  quality: string;
  href: string;
}

export interface ChannelListPayload {
  channels: ChannelRow[];
  counts: { live: number; standby: number; offline: number; total: number };
  checkedAt?: number;
  probed?: boolean;
}

/** Status ordering for the picker: confirmed live first, then standby, offline last. */
const STATUS_WEIGHT: Record<string, number> = { live: 0, unknown: 1, offline: 2 };

/** Sports/competition groups that deserve to sit at the very top. */
const SPORTS_RE = /(sport|football|soccer|fútbol|futbol|foot|be ?in|sports|رياضة|كرة|体育)/i;

export function normalizeChannelList(value: unknown): ChannelListPayload {
  const channels = (Array.isArray((value as any)?.channels) ? (value as any).channels : []).flatMap((raw: any): ChannelRow[] => {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 120) : '';
    if (!id || !name) return [];
    const status = ['live', 'offline'].includes(raw?.status) ? raw.status : 'unknown';
    return [{
      id,
      name,
      group: typeof raw?.group === 'string' ? raw.group.trim().slice(0, 60) : '',
      logo: typeof raw?.logo === 'string' && /^https?:\/\//i.test(raw.logo) ? raw.logo : '',
      source: typeof raw?.source === 'string' ? raw.source.trim().slice(0, 60) : '',
      status,
      quality: typeof raw?.quality === 'string' ? raw.quality.trim().slice(0, 8) : '',
      href: typeof raw?.href === 'string' && raw.href.startsWith('/channel/') ? raw.href : `/channel/${encodeURIComponent(id)}`,
    }];
  });

  const counts = { live: 0, standby: 0, offline: 0, total: channels.length };
  for (const channel of channels) {
    if (channel.status === 'live') counts.live += 1;
    else if (channel.status === 'offline') counts.offline += 1;
    else counts.standby += 1;
  }
  return { channels, counts, checkedAt: Number.isFinite((value as any)?.checkedAt) ? Number((value as any).checkedAt) : undefined };
}

const fold = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

/** Search across name, group and source (accent- and case-insensitive). */
export function filterChannels(channels: ChannelRow[], query: string): ChannelRow[] {
  const needle = fold(String(query || '').trim());
  if (!needle) return channels;
  const terms = needle.split(/\s+/).filter(Boolean);
  return channels.filter((channel) => {
    const haystack = fold(`${channel.name} ${channel.group} ${channel.source} ${channel.quality}`);
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Playable-first ordering: on-air channels, then standby, then offline; sports
 * groups lead inside each band, then alphabetical. Never hides a channel —
 * blocked probes ("standby") stay fully clickable.
 */
export function sortChannels(channels: ChannelRow[]): ChannelRow[] {
  return [...channels].sort((a, b) => {
    const statusDiff = (STATUS_WEIGHT[a.status] ?? 1) - (STATUS_WEIGHT[b.status] ?? 1);
    if (statusDiff) return statusDiff;
    const sportsDiff = Number(SPORTS_RE.test(b.group)) - Number(SPORTS_RE.test(a.group));
    if (sportsDiff) return sportsDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export interface ChannelSelectionOptions {
  query?: string;
  limit?: number;
  /** Keep offline rows out of the list (used when the viewer asks for live only). */
  liveOnly?: boolean;
}

export function selectChannels(payload: ChannelListPayload | null | undefined, options: ChannelSelectionOptions = {}): ChannelRow[] {
  const rows = payload?.channels || [];
  const scoped = options.liveOnly ? rows.filter((channel) => channel.status !== 'offline') : rows;
  const matched = sortChannels(filterChannels(scoped, options.query || ''));
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit as number)) : matched.length;
  return matched.slice(0, limit);
}

/** Distinct groups in display order, for the group filter chips. */
export function channelGroups(channels: ChannelRow[], max = 12): string[] {
  const seen = new Map<string, number>();
  for (const channel of sortChannels(channels)) {
    if (!channel.group) continue;
    seen.set(channel.group, (seen.get(channel.group) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([group]) => group);
}

export function statusLabel(status: ChannelRow['status']): string {
  return status === 'live' ? 'Live' : status === 'offline' ? 'Offline' : 'Standby';
}
