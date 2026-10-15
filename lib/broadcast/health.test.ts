import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProxyUrl } from '@/lib/hlsProxy';
import { serverKey } from '@/lib/player/servers';
import { POST } from '@/app/api/stream-health/route';
import { getChannelHealth, PROBE_TIMEOUT_MS, probeChannelHealth } from './probe';
import { playbackProbeTarget } from './streamHealth';

const cache = vi.hoisted(() => new Map<string, { value: unknown; expiresAt: number }>());
vi.mock('@/lib/cache/cacheManager', () => ({ getCacheManager: () => ({
  get: async (key: string) => { const entry = cache.get(key); return entry && entry.expiresAt > Date.now() ? entry.value : null; },
  set: async (key: string, value: unknown, ttl: number) => { cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 }); },
}) }));
vi.mock('@/lib/logger', () => ({ default: { debug: vi.fn() } }));
const target = { id: 'channel', url: 'https://cdn.example.com/health/index.m3u8', referer: 'https://player.example.com/' };
const healthRequest = (urls: unknown, headers: Record<string, string> = {}) => new NextRequest('https://footy.example/api/stream-health', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ urls }),
});

beforeEach(() => { cache.clear(); vi.stubEnv('HLS_PROXY_ALLOW_PRIVATE_HOSTS', 'false'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('automated media/latency probing', () => {
  it('records latency only after confirming media, including fragmented manifest headers', async () => {
    const encoder = new TextEncoder();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('#EXT')); controller.enqueue(encoder.encode('M3U\n#EXT-X-VERSION:3\n')); }, cancel: cancelled });
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(137);
    const fetcher = vi.fn(async () => new Response(body)); vi.stubGlobal('fetch', fetcher);
    const result = await probeChannelHealth(target);
    expect(result).toMatchObject({ status: 'live', latencyMs: 37, samples: 1, successRate: 1 });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(target.url, expect.objectContaining({ method: 'GET', redirect: 'manual', headers: expect.objectContaining({ Range: 'bytes=0-8191', Referer: target.referer }) }));
  });

  it('marks 404/410 and fake HTML media offline, including MP4 error pages', async () => {
    for (const status of [404, 410]) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status })));
      expect((await probeChannelHealth(target)).status).toBe('offline');
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<HTML>login required</HTML>', { headers: { 'Content-Type': 'application/octet-stream' } })));
    expect((await probeChannelHealth({ url: 'https://cdn.example.com/clip.mp4' })).status).toBe('offline');
  });

  it('keeps CDN blocks in standby and cancels rejected response bodies on every attempt', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('blocked')); }, cancel }), { status: 403 })));
    const result = await probeChannelHealth(target);
    expect(result).toMatchObject({ status: 'unknown', latencyMs: null, successRate: 0 });
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it('does not classify a reachable HEAD-only endpoint as working HLS playback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'HEAD' ? new Response(null, { status: 200 }) : new Response('no', { status: 403 })));
    expect((await probeChannelHealth(target)).status).toBe('unknown');
  });

  it('aborts hung sources at the deadline instead of delaying failover indefinitely', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted(); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    })));
    const pending = probeChannelHealth(target);
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
    expect((await pending).status).toBe('unknown');
    expect(aborted).toHaveBeenCalled();
  });

  it('caches and deduplicates probes, keeps a five-sample reliability window, and rechecks rotated tokens', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response('#EXTM3U\n')); vi.stubGlobal('fetch', fetcher);
    const [one, two] = await Promise.all([getChannelHealth([target]), getChannelHealth([target])]);
    expect(one.channel.status).toBe('live'); expect(two.channel.status).toBe('live');
    expect(fetcher).toHaveBeenCalledOnce();
    await getChannelHealth([target]); expect(fetcher).toHaveBeenCalledOnce();
    for (let index = 0; index < 5; index++) {
      await vi.advanceTimersByTimeAsync(31_000);
      fetcher.mockImplementation(async () => new Response(index === 0 ? 'gone' : '#EXTM3U\n', { status: index === 0 ? 404 : 200 }));
      const result = await getChannelHealth([target]);
      if (index === 0) expect(result.channel).toMatchObject({ status: 'offline', samples: 2, successRate: 0.5 });
      if (index === 4) expect(result.channel).toMatchObject({ status: 'live', samples: 5, successRate: 0.8 });
    }
    await getChannelHealth([{ ...target, url: `${target.url}?token=rotated` }]);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('bounds the number of probes and leaves unprobed channels unknown', async () => {
    const fetcher = vi.fn(async () => new Response('#EXTM3U\n')); vi.stubGlobal('fetch', fetcher);
    const channels = [0, 1, 2, 3].map((index) => ({ id: String(index), url: `https://cdn.example.com/${index}.m3u8` }));
    const result = await getChannelHealth(channels, { limit: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result['0'].status).toBe('live'); expect(result['2'].status).toBe('unknown');
  });

  it('refuses private initial URLs and redirect hops without making a private-network fetch', async () => {
    const fetcher = vi.fn(async (_url: unknown) => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private.m3u8' } })); vi.stubGlobal('fetch', fetcher);
    expect((await probeChannelHealth({ url: 'http://127.0.0.1/private.m3u8' })).status).toBe('unknown');
    expect(fetcher).not.toHaveBeenCalled();
    expect((await probeChannelHealth(target)).status).toBe('unknown');
    expect(fetcher.mock.calls.every(([url]) => String(url) === target.url)).toBe(true);
  });
});

describe('strong HLS media verification for automatic IPTV backups', () => {
  const mediaPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n';
  const segment = () => { const bytes = new Uint8Array(376); bytes[0] = 0x47; bytes[188] = 0x47; return bytes; };

  it('follows a redirected master, resolves relative variants/segments and includes startup latency', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === target.url) return new Response(null, { status: 302, headers: { Location: '/published/master/index.m3u8' } });
      if (url.endsWith('/master/index.m3u8')) return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\n../720/index.m3u8\n');
      if (url.endsWith('/720/index.m3u8')) return new Response(mediaPlaylist);
      return new Response(segment());
    });
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(255);
    expect(await probeChannelHealth(target, { verifyMedia: true })).toMatchObject({ status: 'live', mediaVerified: true, latencyMs: 155 });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([target.url, 'https://cdn.example.com/published/master/index.m3u8', 'https://cdn.example.com/published/720/index.m3u8', 'https://cdn.example.com/published/720/segment.ts']);
    expect(fetcher).toHaveBeenLastCalledWith('https://cdn.example.com/published/720/segment.ts', expect.objectContaining({ method: 'GET', redirect: 'manual', headers: expect.objectContaining({ Range: 'bytes=0-8191', Referer: target.referer }) }));
  });

  it('does not accept a bare #EXTM3U header or a channel index as a working stream', async () => {
    for (const body of ['#EXTM3U\n', '#EXTM3U\n#EXTINF:-1 tvg-id="ESPN",ESPN\nhttps://cdn.example.com/espn.m3u8\n']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
      expect(await probeChannelHealth(target, { verifyMedia: true })).toMatchObject({ status: 'unknown', mediaVerified: false });
    }
  });

  it.each([404, 403])('rejects a reachable playlist whose segment returns %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('.ts') ? 'blocked' : mediaPlaylist, { status: url.endsWith('.ts') ? status : 200 })));
    expect((await probeChannelHealth(target, { verifyMedia: true })).status).toBe(status === 404 ? 'offline' : 'unknown');
  });

  it('rejects login/error bodies masquerading as media and DRM/key-dependent playlists', async () => {
    for (const error of ['<html>login</html>', '{"error":"expired"}']) {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('.ts') ? error : mediaPlaylist, { headers: { 'Content-Type': 'application/octet-stream' } })));
      expect((await probeChannelHealth(target, { verifyMedia: true })).status).not.toBe('live');
    }
    const fetcher = vi.fn(async () => new Response(mediaPlaylist.replace('#EXTINF', '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://license"\n#EXTINF')));
    vi.stubGlobal('fetch', fetcher);
    expect((await probeChannelHealth(target, { verifyMedia: true })).status).toBe('unknown');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not mistake binary data at a manifest endpoint for an HLS playback chain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(segment())));
    expect((await probeChannelHealth(target, { verifyMedia: true })).status).toBe('unknown');
    const fetcher = vi.fn().mockImplementationOnce(async () => new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant.m3u8\n')).mockImplementationOnce(async () => new Response(segment()));
    vi.stubGlobal('fetch', fetcher);
    expect((await probeChannelHealth(target, { verifyMedia: true })).status).toBe('unknown');
  });

  it('validates private variant and segment destinations before issuing a request', async () => {
    for (const body of [mediaPlaylist.replace('segment.ts', 'http://127.0.0.1/private.ts'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://10.0.0.1/private.m3u8\n']) {
      const fetcher = vi.fn(async () => new Response(body)); vi.stubGlobal('fetch', fetcher);
      expect((await probeChannelHealth(target, { verifyMedia: true })).status).toBe('unknown');
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });

  it('cancels a media body at the byte cap when the CDN ignores Range', async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async (url: string) => url.endsWith('.ts') ? new Response(new ReadableStream({
      start(controller) { const bytes = new Uint8Array(16_384); bytes[0] = 0x47; bytes[188] = 0x47; controller.enqueue(bytes); }, cancel,
    })) : new Response(mediaPlaylist));
    vi.stubGlobal('fetch', fetcher);
    expect((await probeChannelHealth(target, { verifyMedia: true })).mediaVerified).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('upgrades weak cached results, shares strong results with the player, and records stability', async () => {
    vi.useFakeTimers();
    let gone = false;
    const fetcher = vi.fn(async (url: string) => url.endsWith('.ts') ? new Response(gone ? 'gone' : segment(), { status: gone ? 404 : 200 }) : new Response(mediaPlaylist));
    vi.stubGlobal('fetch', fetcher);
    expect((await getChannelHealth([target])).channel.mediaVerified).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
    expect((await getChannelHealth([target], { verifyMedia: true })).channel.mediaVerified).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await getChannelHealth([target])).channel.mediaVerified).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    gone = true; await vi.advanceTimersByTimeAsync(31_000);
    expect((await getChannelHealth([target])).channel).toMatchObject({ status: 'offline', mediaVerified: false, successRate: 0.5, samples: 2 });
  });

  it('aborts a hanging strong probe at the same hard deadline', async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted(); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    })));
    const pending = probeChannelHealth(target, { verifyMedia: true });
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
    expect((await pending).status).toBe('unknown');
    expect(aborted).toHaveBeenCalled();
  });
});

describe('signed health API', () => {
  it('checks signed first-party playback links and returns keyed, no-store metrics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('#EXTM3U\n')));
    const url = buildProxyUrl(target.url, { referer: target.referer });
    const response = await POST(healthRequest([url]));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).health[serverKey(url)]).toMatchObject({ status: 'live', successRate: 1, samples: 1 });
  });

  it('rejects unsigned, expired, tampered, unsafe and oversized batches before probing', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const signed = buildProxyUrl(target.url);
    for (const urls of [[], ['https://cdn.example.com/a.m3u8'], [buildProxyUrl(target.url, { expiresAt: 1 })], [signed.replace('sig=', 'sig=wrong')], [buildProxyUrl('http://127.0.0.1/x.m3u8')], Array(13).fill(signed)]) {
      expect((await POST(healthRequest(urls))).status).toBe(400);
    }
    expect(playbackProbeTarget('/api/proxy?url=https://evil.example/x')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and malformed requests safely', async () => {
    expect((await POST(healthRequest([buildProxyUrl(target.url)], { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(new NextRequest('https://footy.example/api/stream-health', { method: 'POST', body: '{broken' }))).status).toBe(400);
    expect((await POST(healthRequest([], { 'content-length': '70000' }))).status).toBe(413);
  });
});
