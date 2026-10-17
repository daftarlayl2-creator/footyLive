import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveChannelStreams } from './channelStreams';
import { GET } from '@/app/api/channels/[id]/streams/route';
import { rankStreams, type StreamHealth } from '@/lib/player/health';
import { buildLiveChannels } from './feeds';
import { IPTV_ORG_SPORTS_URL } from './sources';

const services = vi.hoisted(() => ({ sources: vi.fn(), probe: vi.fn() }));
vi.mock('./feeds', async () => ({ ...await vi.importActual<typeof import('./feeds')>('./feeds'), getChannelSources: services.sources }));
vi.mock('./probe', () => ({ getChannelHealth: services.probe }));
vi.mock('./streamHealth', () => ({ rankChannelsByHealth: async (streams: Parameters<typeof rankStreams>[0]) => rankStreams(streams) }));

const sources = buildLiveChannels([0, 1, 2].map((index) => ({ name: 'ESPN 2 HD', tvgId: 'ESPN2.us@HD', url: `https://sports.example.com/${index}/index.m3u8`, source: 'iptv-org.github.io', feedUrl: IPTV_ORG_SPORTS_URL })));
const health = (status: StreamHealth['status'], mediaVerified = status === 'live'): StreamHealth => ({ status, mediaVerified, checkedAt: Date.now(), latencyMs: 50, samples: 1, successRate: Number(status === 'live') });
beforeEach(() => { services.sources.mockReset().mockResolvedValue(sources); services.probe.mockReset().mockResolvedValue({ [sources[0].id]: health('unknown'), [sources[1].id]: health('unknown'), [sources[2].id]: health('live') }); /* Phase 2: channel APIs 404 while Live TV is hidden — this suite covers the enabled behaviour. */ vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('official channel and Multi-View shared resolution', () => {
  it('keeps a manually chosen blocked channel but auto-adds only segment-verified siblings', async () => {
    const result = await resolveChannelStreams(sources[0].id);
    expect(services.probe).toHaveBeenCalledWith(sources, { limit: 8, verifyMedia: true });
    expect(result?.streams).toHaveLength(2);
    expect(result?.streams[0]).toMatchObject({ provider: 'iptv-org-channel', health: { status: 'live', mediaVerified: true } });
    expect(result?.streams[1].health?.status).toBe('unknown');
    expect(decodeURIComponent(result!.defaultUrl)).toContain('/2/index.m3u8');
    expect(result?.streams.every(({ url }) => url.startsWith('/api/proxy?'))).toBe(true);
  });

  it('returns only signed stream payloads to Multi-View, with no raw entry fields', async () => {
    const response = await GET(new Request('https://footy.example/api/channels/test/streams'), { params: Promise.resolve({ id: sources[0].id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    const data = await response.json();
    expect(data.streams).toHaveLength(2);
    expect(data.channel).toBeUndefined();
    expect(data.streams.every((stream: { url: string; proxiedUrl: string }) => stream.url.startsWith('/api/proxy?') && stream.url === stream.proxiedUrl)).toBe(true);
    expect(data.feedUrl).toBeUndefined();
  });

  it('refuses the Multi-View API mode for free visitors before resolving streams', async () => {
    const response = await GET(new Request('https://footy.example/api/channels/test/streams?multiview=1'), { params: Promise.resolve({ id: sources[0].id }) });
    expect(response.status).toBe(403);
    expect(services.sources).not.toHaveBeenCalled();
  });

  it('rejects invalid ids before loading or probing and handles missing channels', async () => {
    expect(await resolveChannelStreams('../bad')).toBeNull();
    expect(services.sources).not.toHaveBeenCalled(); expect(services.probe).not.toHaveBeenCalled();
    services.sources.mockResolvedValue([]);
    expect(await resolveChannelStreams('a'.repeat(16))).toBeNull();
  });
});
