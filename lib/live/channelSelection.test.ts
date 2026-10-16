import { describe, expect, it } from 'vitest';
import { channelGroups, filterChannels, normalizeChannelList, selectChannels, sortChannels, statusLabel } from './channelSelection';

const payload = {
  checkedAt: 1_700_000_000_000,
  channels: [
    { id: 'bein-1', name: 'beIN SPORTS 1', group: '🏀体育频道', status: 'live', quality: 'FHD', href: '/channel/bein-1' },
    { id: 'sky-1', name: 'Sky Sports Premier League', group: 'Sports', status: 'unknown', quality: 'HD' },
    { id: 'cctv-1', name: 'CCTV-1', group: '📺央视频道', status: 'live' },
    { id: 'dead-1', name: 'Dead Channel', group: 'Sports', status: 'offline' },
    { id: 'canal-1', name: 'Canal+ Sport', group: 'Sports', status: 'live', source: 'iptv-org', logo: 'https://cdn.example/canal.png' },
    // Junk rows must never reach the UI.
    null,
    { name: 'no id' },
    { id: 'no-name', name: '   ' },
    { id: 'bad-logo', name: 'Bad Logo', logo: 'javascript:alert(1)' },
  ],
};

describe('live channel list normalisation', () => {
  it('keeps only well-formed rows, counts them and drops unsafe values', () => {
    const list = normalizeChannelList(payload);
    expect(list.counts).toEqual({ live: 3, standby: 2, offline: 1, total: 6 });
    expect(list.checkedAt).toBe(1_700_000_000_000);
    expect(list.channels.map((channel) => channel.id)).toEqual(['bein-1', 'sky-1', 'cctv-1', 'dead-1', 'canal-1', 'bad-logo']);
    const badLogo = list.channels.find((channel) => channel.id === 'bad-logo');
    expect(badLogo?.logo).toBe('');
    // Any unparseable payload becomes an empty, renderable list.
    expect(normalizeChannelList(null)).toEqual({ channels: [], counts: { live: 0, standby: 0, offline: 0, total: 0 }, checkedAt: undefined });
    expect(normalizeChannelList({ channels: 'junk' }).channels).toEqual([]);
  });

  it('derives safe channel-page links when the payload omits them', () => {
    const list = normalizeChannelList(payload);
    expect(list.channels.find((channel) => channel.id === 'sky-1')?.href).toBe('/channel/sky-1');
    expect(normalizeChannelList({ channels: [{ id: 'x', name: 'X', href: 'https://evil.example/steal' }] }).channels[0].href)
      .toBe('/channel/x');
  });

  it('orders on-air channels first, sports groups before general TV, then alphabetically', () => {
    const list = normalizeChannelList(payload);
    // On-air first, sports groups inside a band, then alphabetical; the blocked
    // probe ("unknown" → Standby) sits above a confirmed-offline row.
    expect(sortChannels(list.channels).map(({ id, status }) => `${id}:${status}`)).toEqual([
      'bein-1:live', 'canal-1:live', 'cctv-1:live', 'sky-1:unknown', 'bad-logo:unknown', 'dead-1:offline',
    ]);
  });

  it('filters by name, group, source and quality without diacritics or case matter', () => {
    const list = normalizeChannelList(payload);
    expect(filterChannels(list.channels, 'bein').map(({ id }) => id)).toEqual(['bein-1']);
    expect(filterChannels(list.channels, 'PREMIER').map(({ id }) => id)).toEqual(['sky-1']);
    expect(filterChannels(list.channels, 'sports').map(({ id }) => id)).toEqual(['bein-1', 'sky-1', 'dead-1', 'canal-1']);
    expect(filterChannels(list.channels, 'iptv-org').map(({ id }) => id)).toEqual(['canal-1']);
    expect(filterChannels(list.channels, 'canal sport').map(({ id }) => id)).toEqual(['canal-1']);
    expect(filterChannels(list.channels, 'nothing here')).toEqual([]);
    expect(filterChannels(list.channels, '   ')).toHaveLength(list.channels.length);
  });

  it('never shows a dead end: standby rows stay selectable and offline rows can be hidden', () => {
    const list = normalizeChannelList(payload);
    const standbyVisible = selectChannels(list, { query: 'sky' });
    expect(standbyVisible.map(({ id, status }) => `${id}:${status}`)).toEqual(['sky-1:unknown']);
    expect(selectChannels(list, { liveOnly: true }).map(({ id }) => id)).toEqual(['bein-1', 'canal-1', 'cctv-1', 'sky-1', 'bad-logo']);
    expect(selectChannels(list, { limit: 2 }).map(({ id }) => id)).toEqual(['bein-1', 'canal-1']);
    expect(selectChannels(null)).toEqual([]);
    expect(statusLabel('unknown')).toBe('Standby');
  });

  it('lists the most populated groups for the filter chips', () => {
    const list = normalizeChannelList(payload);
    expect(channelGroups(list.channels)).toEqual(['Sports', '🏀体育频道', '📺央视频道']);
    expect(channelGroups(list.channels, 1)).toEqual(['Sports']);
  });
});
