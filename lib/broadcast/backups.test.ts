import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamHealth } from '../player/health';
import type { LiveChannel } from './types';

const probe = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock('./probe', () => ({ getChannelHealth: probe.health }));
vi.mock('../logger', () => ({ default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import {
  backupFamily, backupProvider, footballAffinity, isFeedProvider, MAX_BACKUP_PROBES, MAX_LIVE_BACKUPS,
  rankLiveBackupCandidates, resetLiveBackupSelection, selectLiveBackups,
} from './backups';
import { buildLiveChannels, DEFAULT_LIVE_FEEDS, getStaticFallbackChannels } from './feeds';
import { GUOVIN_IPTV_API_URL, IPTV_ORG_SPORTS_URL } from './sources';

const LIVE_EVENTS = DEFAULT_LIVE_FEEDS[0];

const live = (): StreamHealth => ({ status: 'live', mediaVerified: true, latencyMs: 120, checkedAt: Date.now(), successRate: 1, samples: 3 });
const offline = (): StreamHealth => ({ status: 'offline', mediaVerified: false, latencyMs: null, checkedAt: Date.now(), successRate: 0, samples: 3 });
const manifestOnly = (): StreamHealth => ({ status: 'unknown', mediaVerified: false, latencyMs: null, checkedAt: Date.now(), successRate: 0, samples: 1 });

/** Health by URL substring, e.g. `{ '/live/': live }`; everything else unknown. */
function healthBy(rules: Record<string, () => StreamHealth>) {
  probe.health.mockImplementation(async (targets: LiveChannel[]) => Object.fromEntries(targets.map((target) => {
    const rule = Object.entries(rules).find(([needle]) => target.url.includes(needle));
    return [target.id, rule ? rule[1]() : manifestOnly()];
  })));
}

/** A small, realistic mix of the three default feeds (titles/groups as published). */
const POOL = buildLiveChannels([
  // ibstvofficial/Live-events: one football event + a promo that must never surface.
  { name: 'Celta vs Juventus- 16 Oct 2026 | UEFA Europa League 2026-27', group: 'Football', url: 'https://events.example.com/live/celta/index.m3u8', source: 'raw.githubusercontent.com', feedUrl: LIVE_EVENTS },
  { name: 'Join our Telegram for more events', url: 'https://events.example.com/promo/Telegram.mp4', source: 'raw.githubusercontent.com', feedUrl: LIVE_EVENTS },
  // Guovin IPTV-API: generator timestamp, a general channel, sports + football channels, a non-football "sport".
  { name: '2026-10-12 08:00:00', group: '🕘️更新时间', url: 'http://198.51.100.7:82/live/timestamp.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: 'CCTV-1', group: '📺央视频道', tvgId: 'CCTV-1', url: 'http://198.51.100.7:82/live/cctv1.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: '魅力足球', group: '🏀体育频道', url: 'http://198.51.100.8:8181/live/mlzq.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: 'CCTV-5', group: '📺央视频道', tvgId: 'CCTV-5', url: 'http://198.51.100.9/live/cctv5.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  { name: '快乐垂钓', group: '🏀体育频道', url: 'http://198.51.100.9/live/fishing.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
  // IPTV-Org sports category.
  { name: 'ESPN 2 HD (720p)', group: 'Sports', url: 'https://iptv.example.com/espn2/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
  { name: 'Football.ru (1080p)', group: 'Sports', url: 'https://iptv.example.com/football-ru/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
  { name: 'NBA TV (720p)', group: 'Sports', url: 'https://iptv.example.com/nba/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
]);
const byName = (name: string) => POOL.find((channel) => channel.name === name)!;
const FIXTURE = { title: 'Arsenal vs Liverpool', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Liverpool' } };

beforeEach(() => {
  resetLiveBackupSelection();
  probe.health.mockReset().mockResolvedValue({});
});

describe('feed families and football relevance', () => {
  it('recognises every transport of the default feeds', () => {
    expect(backupFamily(IPTV_ORG_SPORTS_URL)).toBe('iptv-org');
    expect(backupFamily(GUOVIN_IPTV_API_URL)).toBe('guovin');
    expect(backupFamily('https://api.github.com/repos/Guovin/iptv-api/contents/output/result.m3u?ref=gd')).toBe('guovin');
    expect(backupFamily('https://github.com/Guovin/iptv-api/releases/download/playlist-20261012-112551-utc-plus-0800/ipv4.m3u')).toBe('guovin');
    expect(backupFamily('https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/ipv6/result.m3u')).toBe('guovin');
    expect(backupFamily(LIVE_EVENTS)).toBe('events');
    expect(backupFamily('eviv://standby')).toBe('standby');
    // Look-alikes are not the official generator.
    expect(backupFamily('https://github.com/someone/iptv-api/releases/download/x/result.m3u')).toBe('events');
  });

  it('scores football channels across languages and drops other sports and general TV', () => {
    expect(footballAffinity(byName('魅力足球'), 'guovin')).toBe(3);
    expect(footballAffinity(byName('Football.ru (1080p)'), 'iptv-org')).toBe(3);
    expect(footballAffinity(byName('CCTV-5'), 'guovin')).toBe(2);
    expect(footballAffinity(byName('ESPN 2 HD (720p)'), 'iptv-org')).toBe(2);
    expect(footballAffinity({ name: '爱体育', group: '🏀体育频道' }, 'guovin')).toBe(1);
    expect(footballAffinity({ name: 'Sportitalia', group: 'Sports' }, 'iptv-org')).toBe(1);
    expect(footballAffinity({ name: 'Un-grouped event' }, 'events')).toBe(1);
    expect(footballAffinity(byName('快乐垂钓'), 'guovin')).toBe(0);
    expect(footballAffinity(byName('NBA TV (720p)'), 'iptv-org')).toBe(0);
    // Competition names are weaker than another sport named outright.
    expect(footballAffinity({ name: 'Strongman Champions League (720p)', group: 'Sports' }, 'iptv-org')).toBe(0);
    expect(footballAffinity({ name: 'UEFA Champions League Live', group: 'Sports' }, 'iptv-org')).toBe(3);
    expect(footballAffinity(byName('CCTV-1'), 'guovin')).toBe(0);
    expect(footballAffinity({ name: 'Lakers vs Celtics', group: 'Basketball' }, 'events')).toBe(0);
    expect(footballAffinity(getStaticFallbackChannels()[0], 'standby')).toBe(0);
  });

  it('never turns promos or generator timestamps into channels', () => {
    expect(POOL.some((channel) => /telegram/i.test(channel.name))).toBe(false);
    expect(POOL.some((channel) => channel.group === '🕘️更新时间')).toBe(false);
  });
});

describe('ranking live backups across every feed', () => {
  it('puts reported broadcasters first, then football channels, interleaving feed families', () => {
    const ranked = rankLiveBackupCandidates(POOL, { ...FIXTURE, broadcasters: ['ESPN 2'] });
    expect(ranked.map(({ channel, coverage }) => [channel.name, coverage])).toEqual([
      ['ESPN 2 HD (720p)', 'broadcaster'],
      // Football tier: one IPTV-Org and one Guovin entry, interleaved by family.
      ['Football.ru (1080p)', 'sports'],
      ['魅力足球', 'sports'],
      // Network tier: the Live-events listing of another game is capped below football channels.
      ['Celta vs Juventus- 16 Oct 2026 | UEFA Europa League 2026-27', 'sports'],
      ['CCTV-5', 'sports'],
    ]);
  });

  it('probes geo-blocked or part-time listings after equivalent channels', () => {
    const channels = buildLiveChannels([
      { name: 'Canal+ Sport (1080p) [Geo-blocked]', group: 'Sports', url: 'https://iptv.example.com/canal/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
      { name: 'beIN SPORTS XTRA (1080p) [Not 24/7]', group: 'Sports', url: 'https://iptv.example.com/bein-xtra/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
      { name: 'Digi Sport 2 HD (1080i)', group: 'Sports', url: 'https://iptv.example.com/digi/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
    ]);
    expect(rankLiveBackupCandidates(channels, FIXTURE).map(({ channel }) => channel.name)[0]).toBe('Digi Sport 2 HD (1080i)');
  });

  it('caps near-duplicate editions and weaves football networks between football channels', () => {
    const editions = ['FIFA+ (720p)', 'FIFA+ French (720p)', 'FIFA+ German (720p)', 'FIFA+ Italy (720p)', 'Futbol TV (1080p)'];
    const channels = buildLiveChannels([
      ...editions.map((name, index) => ({ name, group: 'Sports', url: `https://iptv.example.com/f${index}/index.m3u8`, source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL })),
      { name: 'ESPN (1080p)', group: 'Sports', url: 'https://iptv.example.com/espn/index.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
    ]);
    // FHD first within a tier; a third FIFA+ edition waits until other brands had a turn.
    expect(rankLiveBackupCandidates(channels, FIXTURE).map(({ channel }) => channel.name)).toEqual([
      'Futbol TV (1080p)', 'FIFA+ (720p)', 'ESPN (1080p)', 'FIFA+ French (720p)', 'FIFA+ German (720p)', 'FIFA+ Italy (720p)',
    ]);
  });

  it('maps a two-team listing in any feed as fixture coverage', () => {
    const [first] = rankLiveBackupCandidates([...POOL, ...buildLiveChannels([
      { name: 'Arsenal vs Liverpool | Premier League', group: '🏀体育频道', url: 'http://198.51.100.10/live/ars-liv.m3u8', source: 'guovin.github.io', feedUrl: GUOVIN_IPTV_API_URL },
    ])], FIXTURE);
    expect(first).toMatchObject({ family: 'guovin', coverage: 'fixture' });
  });

  it('keeps other-game listings out of the official pools and standby channels out entirely', () => {
    const official = buildLiveChannels([
      { name: 'Real Madrid vs Roma', group: 'Sports', url: 'https://iptv.example.com/other-game.m3u8', source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL },
    ]);
    expect(rankLiveBackupCandidates([...official, ...getStaticFallbackChannels()], FIXTURE)).toEqual([]);
  });
});

describe('selectLiveBackups', () => {
  it('maps a live fixture to media-verified Guovin and IPTV-Org streams, not just the event feed', async () => {
    healthBy({ '/mlzq.': live, '/football-ru/': live, '/celta/': offline });
    const backups = await selectLiveBackups(POOL, FIXTURE);
    expect(backups.map(({ channel }) => channel.name)).toEqual(['Football.ru (1080p)', '魅力足球']);
    expect(backups.map(backupProvider)).toEqual(['iptv-org-fallback-sports', 'guovin-fallback-sports']);
    expect(backups.every(({ verified, health }) => verified && health?.mediaVerified)).toBe(true);
    expect(probe.health).toHaveBeenCalledWith(expect.any(Array), { limit: MAX_BACKUP_PROBES, verifyMedia: true });
  });

  it('only tolerates unverified (never offline) entries from event feeds', async () => {
    healthBy({ '/espn2/': offline });
    const backups = await selectLiveBackups(POOL, FIXTURE);
    // Guovin/IPTV-Org entries without a verified segment are not auto-injected.
    expect(backups.map(({ channel, verified }) => [channel.name, verified])).toEqual([
      ['Celta vs Juventus- 16 Oct 2026 | UEFA Europa League 2026-27', false],
    ]);
    expect(backupProvider(backups[0])).toBe('livefeed-fallback');
  });

  it('keeps event-feed channels available when the probe service itself fails', async () => {
    probe.health.mockRejectedValueOnce(new Error('probes blocked'));
    const backups = await selectLiveBackups(POOL, FIXTURE);
    expect(backups.map(({ family }) => family)).toEqual(['events']);
  });

  it('honours the exclude list and the limit', async () => {
    healthBy({ '/': live });
    const all = await selectLiveBackups(POOL, FIXTURE);
    expect(all.length).toBeLessThanOrEqual(MAX_LIVE_BACKUPS);
    const without = await selectLiveBackups(POOL, FIXTURE, { exclude: [byName('Football.ru (1080p)').url], limit: 2 });
    expect(without).toHaveLength(2);
    expect(without.some(({ channel }) => channel.name === 'Football.ru (1080p)')).toBe(false);
    expect(await selectLiveBackups(POOL, FIXTURE, { limit: 0 })).toEqual([]);
  });

  it('does not fail early: an all-dead window rotates immediately to unexplored channels', async () => {
    const many = buildLiveChannels(Array.from({ length: 40 }, (_, index) => ({
      name: `Sport ${index + 1}`, group: 'Sports', url: `https://iptv.example.com/sport-${index + 1}/index.m3u8`,
      source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL,
    })));
    const names = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `Sport ${from + index}`);
    const probed = (call: number) => (probe.health.mock.calls[call][0] as LiveChannel[]).map(({ name }) => name);

    // A productive window is kept for the rest of its 30-second epoch.
    healthBy({ '/sport-3/': live });
    expect((await selectLiveBackups(many, FIXTURE)).map(({ channel }) => channel.name)).toEqual(['Sport 3']);
    await selectLiveBackups(many, FIXTURE);
    expect(probed(0)).toEqual(names(1, 24));
    expect(probed(1)).toEqual(probed(0));

    // An all-dead window rotates on the very next resolution: the twelve best
    // candidates are rechecked and twelve unexplored channels are added.
    resetLiveBackupSelection();
    probe.health.mockClear();
    healthBy({ '/': offline });
    expect(await selectLiveBackups(many, FIXTURE)).toEqual([]);
    expect(await selectLiveBackups(many, FIXTURE)).toEqual([]);
    expect(probed(0)).toEqual(names(1, 24));
    expect(probed(1)).toEqual([...names(1, 12), ...names(25, 36)]);
  });
});

describe('provider labels', () => {
  it('marks generic coverage as fallback and keeps every feed link behind the signed proxy', () => {
    expect(backupProvider({ family: 'guovin', coverage: 'broadcaster' })).toBe('guovin-fallback-broadcaster');
    expect(backupProvider({ family: 'iptv-org', coverage: 'fixture' })).toBe('iptv-org');
    expect(backupProvider({ family: 'events', coverage: 'sports' })).toBe('livefeed-fallback');
    for (const provider of ['livefeed', 'livefeed-fallback', 'iptv-org-fallback-sports', 'guovin-fallback-sports']) expect(isFeedProvider(provider)).toBe(true);
    for (const provider of ['watchfooty', 'streamed', 'cdnlive', undefined]) expect(isFeedProvider(provider)).toBe(false);
  });
});
