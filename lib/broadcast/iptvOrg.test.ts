import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rankIptvOrgCandidates, resetIptvOrgSelection, selectVerifiedIptvOrgChannels, MAX_IPTV_ORG_PROBES } from './iptvOrg';
import { IPTV_ORG_SPORTS_URL } from './sources';
import type { LiveChannel } from './types';
import type { StreamHealth } from '../player/health';

const probe = vi.hoisted(() => vi.fn());
vi.mock('./probe', () => ({ getChannelHealth: probe }));
const fixture = { title: 'Real Madrid vs AC Milan', homeTeam: { name: 'Real Madrid' }, awayTeam: { name: 'AC Milan' }, broadcasters: ['ESPN 2'] };
const channel = (id: number, name = `Sports Channel ${id}`, overrides: Partial<LiveChannel> = {}): LiveChannel => ({
  id: id.toString(16).padStart(16, '0'), name, url: `https://cdn.example.com/${id}/index.m3u8`,
  feedUrl: IPTV_ORG_SPORTS_URL, source: 'iptv-org.github.io', group: 'Sports', quality: 'FHD', ...overrides,
});
const live = (latencyMs = 50, overrides: Partial<StreamHealth> = {}): StreamHealth => ({
  status: 'live', latencyMs, checkedAt: Date.now(), successRate: 1, samples: 5, mediaVerified: true, ...overrides,
});
const healthFor = (channels: LiveChannel[], health = live()) => Object.fromEntries(channels.map(({ id }) => [id, health]));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T18:00:00Z')); resetIptvOrgSelection(); probe.mockReset(); });
afterEach(() => { resetIptvOrgSelection(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('IPTV-Org fixture/network candidate mapping', () => {
  it('ranks confident two-team aliases before real broadcast metadata and generic sports', () => {
    const channels = [channel(1), channel(2, 'ESPN 2 (720p)'), channel(3, 'RMA vs AC Milan (1080p)'), channel(4, 'Juventus vs Roma'), channel(5, 'Legacy', { feedUrl: 'https://other.example.com/list.m3u' })];
    const candidates = rankIptvOrgCandidates(channels, fixture);
    expect(candidates.map(({ channel: item, coverage }) => [item.id, coverage])).toEqual([
      [channels[2].id, 'fixture'], [channels[1].id, 'broadcaster'], [channels[0].id, 'sports'],
    ]);
    expect(rankIptvOrgCandidates(channels, fixture, false).map(({ coverage }) => coverage)).toEqual(['fixture']);
  });

  it('does not invent broadcaster rights from a league/team name and respects explicit numbers', () => {
    const channels = [channel(1, 'beIN SPORTS 1'), channel(2, 'ESPN 2'), channel(3, 'ESPN 3')];
    expect(rankIptvOrgCandidates(channels, { ...fixture, broadcasters: [] }).every(({ coverage }) => coverage === 'sports')).toBe(true);
    expect(rankIptvOrgCandidates(channels, fixture).map(({ channel: item, coverage }) => [item.id, coverage])).toEqual([
      [channels[1].id, 'broadcaster'], [channels[0].id, 'sports'], [channels[2].id, 'sports'],
    ]);
  });

  it('deduplicates URLs and prefers advertised FHD/HD before probing', () => {
    const channels = [channel(1, 'Sports SD', { quality: 'SD' }), channel(2, 'Sports HD', { quality: 'HD' }), channel(3, 'Sports FHD'), channel(4, 'Duplicate', { url: channel(3).url })];
    expect(rankIptvOrgCandidates(channels, fixture).map(({ channel: item }) => item.id)).toEqual([channels[2].id, channels[1].id, channels[0].id]);
  });
});

describe('health-gated automatic backup pool', () => {
  it('excludes offline, blocked, stale, future and manifest-only observations', async () => {
    const channels = Array.from({ length: 7 }, (_, index) => channel(index));
    probe.mockResolvedValue({
      [channels[0].id]: live(), [channels[1].id]: live(50, { status: 'offline' }),
      [channels[2].id]: live(50, { status: 'unknown' }), [channels[3].id]: live(50, { checkedAt: Date.now() - 91_000 }),
      [channels[4].id]: live(50, { checkedAt: Date.now() + 6000 }), [channels[5].id]: live(50, { mediaVerified: undefined }),
      [channels[6].id]: live(50, { samples: 0 }),
    });
    expect((await selectVerifiedIptvOrgChannels(channels, fixture)).map(({ channel: item }) => item.id)).toEqual([channels[0].id]);
    expect(probe).toHaveBeenCalledWith(channels, { limit: MAX_IPTV_ORG_PROBES, verifyMedia: true });
  });

  it('ranks stable fast HD above slow/flaky FHD, preferring FHD when latency is comparable', async () => {
    const channels = [channel(0, 'Sports HD', { quality: 'HD' }), channel(1), channel(2), channel(3)];
    probe.mockResolvedValue({ [channels[0].id]: live(100), [channels[1].id]: live(120), [channels[2].id]: live(900), [channels[3].id]: live(10, { successRate: 0.4 }) });
    expect((await selectVerifiedIptvOrgChannels(channels, fixture)).map(({ channel: item }) => item.id)).toEqual([channels[1].id, channels[0].id, channels[2].id]);
  });

  it('keeps verified fixture/network evidence ahead of unrelated sports regardless of a faster ping', async () => {
    const channels = [channel(0), channel(1, 'ESPN 2'), channel(2, 'Real Madrid vs AC Milan')];
    probe.mockResolvedValue({ [channels[0].id]: live(1), [channels[1].id]: live(300), [channels[2].id]: live(1000) });
    expect((await selectVerifiedIptvOrgChannels(channels, fixture)).map(({ coverage }) => coverage)).toEqual(['fixture', 'broadcaster', 'sports']);
  });

  it('bounds probing, shares a window, and rotates beyond dead front-of-list channels', async () => {
    const channels = Array.from({ length: 60 }, (_, index) => channel(index));
    probe.mockImplementation(async (selected: LiveChannel[]) => Object.fromEntries(selected.map((item) => [item.id, live(50, { status: channels.indexOf(item) >= 24 ? 'live' : 'offline' })])));
    expect(await selectVerifiedIptvOrgChannels(channels, fixture)).toEqual([]);
    expect(await selectVerifiedIptvOrgChannels(channels, fixture)).toEqual([]);
    expect(probe.mock.calls[0][0]).toEqual(channels.slice(0, 24));
    expect(probe.mock.calls[1][0]).toEqual(channels.slice(0, 24));
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await selectVerifiedIptvOrgChannels(channels, fixture)).map(({ channel: item }) => item.id)).toEqual(channels.slice(24, 27).map(({ id }) => id));
    expect(probe.mock.calls[2][0]).toEqual([...channels.slice(0, 12), ...channels.slice(24, 36)]);
  });

  it('coalesces concurrent match/Multi-View selections and rechecks rotated URLs', async () => {
    const channels = [channel(1)];
    let finish!: (health: Record<string, StreamHealth>) => void;
    probe.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const one = selectVerifiedIptvOrgChannels(channels, fixture);
    const two = selectVerifiedIptvOrgChannels(channels, fixture);
    expect(probe).toHaveBeenCalledOnce();
    finish(healthFor(channels));
    expect(await one).toEqual(await two);
    const rotated = [{ ...channels[0], url: `${channels[0].url}?token=new` }];
    probe.mockResolvedValue(healthFor(rotated));
    expect((await selectVerifiedIptvOrgChannels(rotated, fixture))[0].channel.url).toContain('token=new');
    expect(probe.mock.calls[1][0]).toEqual(rotated);
  });

  it('does no probing for disabled/empty pools, zero limits or unrelated upcoming fixtures', async () => {
    expect(await selectVerifiedIptvOrgChannels([], fixture)).toEqual([]);
    expect(await selectVerifiedIptvOrgChannels([channel(1)], fixture, { limit: 0 })).toEqual([]);
    expect(await selectVerifiedIptvOrgChannels([channel(1)], fixture, { allowFallback: false })).toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });
});
