// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MultiStreamPage from '@/app/multistream/page';
import StreamPlayer from '@/components/StreamPlayer';
import MultiStreamSlot from './MultiStreamSlot';
import { serverKey } from '@/lib/player/servers';
import { HEALTH_REFRESH_MS } from '@/lib/player/health';

const media = vi.hoisted(() => ({ instances: [], refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: media.refresh }) }));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/player/loadHls', () => ({ loadHls: vi.fn(async () => {
  class Hls {
    static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', KEY_SYSTEM_ERROR: 'keySystemError' };
    static ErrorDetails = { MANIFEST_INCOMPATIBLE_CODECS_ERROR: 'codecs', MANIFEST_LOAD_TIMEOUT: 'manifestTimeout', LEVEL_LOAD_TIMEOUT: 'levelTimeout', FRAG_LOAD_TIMEOUT: 'fragTimeout' };
    static isSupported() { return true; }
    handlers = new Map();
    destroyed = false;
    recoverMediaError = vi.fn();
    constructor() { media.instances.push(this); }
    attachMedia(element) { this.element = element; }
    loadSource(url) { this.url = url; }
    on(event, handler) { this.handlers.set(event, handler); }
    emit(event, data) { this.handlers.get(event)?.(event, data); }
    destroy() { this.destroyed = true; }
  }
  return Hls;
}) }));

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const channels = 'abcde'.split('').map((char, index) => ({ id: char.repeat(16), name: `IPTV ${index + 1}`, group: 'Football', quality: 'FHD', status: 'live' }));
const match = { id: 'espn-1', title: 'Arsenal vs Liverpool', status: 'live' };
const streamsFor = (id) => ['main', 'backup'].map((name, index) => ({
  name, kind: 'hls', quality: index ? 'HD' : 'FHD', provider: 'livefeed',
  url: `/api/proxy?url=${encodeURIComponent(`https://cdn.example.com/${id}/${name}.m3u8`)}&exp=9999999999999&sig=test`,
}));
let container; let root; let fetcher; let overrides;
const live = (latencyMs = 50) => ({ status: 'live', latencyMs, checkedAt: Date.now(), successRate: 1, samples: 5 });
const offline = () => ({ status: 'offline', latencyMs: null, checkedAt: Date.now(), successRate: 0, samples: 5 });

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  window.happyDOM.setURL('https://footy.example/multistream');
  window.localStorage.clear(); media.instances.length = 0; overrides = {};
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  fetcher = vi.fn(async (url, init) => {
    if (url === '/api/matches') return json({ matches: [match] });
    if (url === '/api/live-channels?probe=0') return json({ channels });
    if (String(url).startsWith('/api/channels/')) {
      const id = String(url).split('/')[3];
      return json({ streams: streamsFor(id), matchTitle: channels.find((channel) => channel.id === id)?.name, matchStatus: 'live' });
    }
    if (url === '/api/streams/espn-1') return json({ streams: streamsFor('match'), matchTitle: match.title, matchStatus: 'live' });
    if (url === '/api/stream-health') return json({ health: Object.fromEntries(JSON.parse(init.body).urls.map((stream) => [serverKey(stream), overrides[serverKey(stream)]?.() ?? live()])) });
    return json({ error: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetcher);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tick = async (ms = 1) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const render = async (element) => { await act(async () => root.render(element)); await tick(); };
const click = async (element) => { await act(async () => element.click()); await tick(); };
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find((element) => element.textContent.includes(text));
const tile = (index) => container.querySelector(`[data-multiview-slot="${index + 1}"]`);
const activeDecoders = () => media.instances.filter((instance) => !instance.destroyed);
async function addChannel(slot, channelIndex) {
  await click(tile(slot).querySelector('button[aria-label^="Choose"], button[aria-label^="Replace"]'));
  await click(button(channels[channelIndex].name, document.querySelector('[role="dialog"]')));
}
async function readyVideos() { await act(async () => { for (const video of container.querySelectorAll('video')) video.dispatchEvent(new Event('loadeddata')); }); }

describe('Multi-View IPTV integration', () => {
  it('plays four independent, initially muted IPTV streams without allowing a fifth screen', async () => {
    await render(<MultiStreamPage />);
    for (let index = 0; index < 4; index++) await addChannel(index, index);
    expect(container.querySelectorAll('video')).toHaveLength(4);
    expect(activeDecoders()).toHaveLength(4);
    expect([...container.querySelectorAll('video')].every((video) => video.muted)).toBe(true);
    expect(container.textContent).toContain('4 / 4 screens');

    await click(tile(0).querySelector('button[aria-label="Replace source for screen 1"]'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(button('IPTV 2', dialog).disabled).toBe(true);
    await click(button('IPTV 5', dialog));
    expect(container.querySelectorAll('[data-multiview-slot]')).toHaveLength(4);
    expect(container.querySelectorAll('video')).toHaveLength(4);
    expect(activeDecoders()).toHaveLength(4);
    expect(tile(0).textContent).toContain('IPTV 5');
  });

  it('changes per-tile audio and mutes all without restarting any decoder', async () => {
    await render(<MultiStreamPage />); await addChannel(0, 0); await addChannel(1, 1);
    const decoders = [...activeDecoders()];
    const videos = container.querySelectorAll('video');
    await click(tile(0).querySelector('button[title="Unmute"]'));
    expect(videos[0].muted).toBe(false); expect(videos[1].muted).toBe(true);
    await click(button('Mute all'));
    expect(videos[0].muted).toBe(true);
    expect(activeDecoders()).toEqual(decoders);
    expect(media.instances).toHaveLength(2);
  });

  it('automatically fails over a fatal HLS source while other screens keep playing, then cleans up removed screens', async () => {
    await render(<MultiStreamPage />);
    for (let index = 0; index < 4; index++) await addChannel(index, index);
    const initial = [...activeDecoders()];
    await act(async () => initial[0].emit('error', { fatal: true, type: 'networkError', details: 'fragmentFailure' }));
    expect(initial[0].destroyed).toBe(true);
    expect(activeDecoders().some((decoder) => decoder.url.includes(encodeURIComponent(`${channels[0].id}/backup.m3u8`)))).toBe(true);
    expect(initial.slice(1).every((decoder) => !decoder.destroyed)).toBe(true);
    expect(tile(0).textContent).toContain('Switched to Backup');
    await click(tile(0).querySelector('button[aria-label="Remove screen 1"]'));
    expect(container.querySelectorAll('video')).toHaveLength(3);
    expect(activeDecoders()).toHaveLength(3);
  });

  it('uses automatic health pings to switch an offline active source, without user interaction', async () => {
    await render(<MultiStreamPage />); await addChannel(0, 0); await addChannel(1, 1);
    await readyVideos();
    const other = activeDecoders()[1];
    overrides[serverKey(streamsFor(channels[0].id)[0].url)] = offline;
    await tick(HEALTH_REFRESH_MS);
    expect(tile(0).textContent).toContain('Health check confirmed this stream is offline');
    expect(activeDecoders().some((decoder) => decoder.url.includes(encodeURIComponent(`${channels[0].id}/backup.m3u8`)))).toBe(true);
    expect(other.destroyed).toBe(false);
  });

  it('combines a live fixture with IPTV channels and supports Escape/focus return in the picker', async () => {
    await render(<MultiStreamPage />); await addChannel(0, 0);
    const choose = tile(1).querySelector('button[aria-label="Choose source for screen 2"]');
    choose.focus(); await click(choose);
    expect(document.activeElement.type).toBe('search');
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs[0].focus();
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(tabs[1]);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(choose);
    await click(choose); await click(button('Live matches'));
    await click(button('Arsenal vs Liverpool', document.querySelector('[role="dialog"]')));
    expect(container.querySelectorAll('video')).toHaveLength(2);
    expect(tile(1).querySelector('a').getAttribute('href')).toBe('/watch/espn-1');
    expect(fetcher).toHaveBeenCalledWith('/api/streams/espn-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});

describe('official IPTV-Org match backups in Multi-View', () => {
  it('automatically rotates a failed fixture into its signed network backup and discloses unconfirmed fixture coverage', async () => {
    const originalFetch = fetcher.getMockImplementation();
    const streams = streamsFor('official-match').map((stream, index) => ({
      ...stream, provider: index ? 'iptv-org-fallback-broadcaster' : 'watchfooty',
      name: index ? 'ESPN 2 HD' : 'Fixture source', coverage: index ? 'broadcaster' : 'fixture',
      health: { ...live(index ? 30 : 800), mediaVerified: !!index },
    }));
    fetcher.mockImplementation(async (url, init) => url === '/api/streams/espn-1'
      ? json({ streams, defaultUrl: streams[0].url, matchTitle: match.title, matchStatus: 'live' }) : originalFetch(url, init));
    await render(<MultiStreamSlot source={{ type: 'match', id: match.id, title: match.title }} />);
    expect(activeDecoders()[0].url).toBe(streams[0].url);
    expect(container.querySelector('[data-unverified-backup]')).toBeNull();
    const first = activeDecoders()[0];
    await act(async () => first.emit('error', { fatal: true, type: 'networkError', details: 'fragmentFailure' }));
    expect(first.destroyed).toBe(true);
    expect(activeDecoders()[0].url).toBe(streams[1].url);
    expect(container.querySelector('[data-unverified-backup]').textContent).toContain('may show a different fixture');
    expect(fetcher).toHaveBeenCalledWith('/api/streams/espn-1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});

describe('shared smart player behavior', () => {
  it('selects the fastest healthy startup source but never interrupts healthy playback to chase a later latency change', async () => {
    const streams = streamsFor('ranking');
    overrides[serverKey(streams[0].url)] = () => live(900);
    overrides[serverKey(streams[1].url)] = () => live(30);
    await render(<StreamPlayer compact initialMuted channels={streams} matchStatus="live" />);
    expect(activeDecoders()).toHaveLength(1);
    expect(activeDecoders()[0].url).toBe(streams[1].url);
    await readyVideos();
    const current = activeDecoders()[0]; const starts = media.instances.length;
    overrides[serverKey(streams[0].url)] = () => live(10);
    overrides[serverKey(streams[1].url)] = () => live(700);
    await tick(HEALTH_REFRESH_MS);
    expect(activeDecoders()[0]).toBe(current);
    expect(media.instances).toHaveLength(starts);
  });

  it('keeps the no-first-frame watchdog armed after a manifest loads but media never arrives', async () => {
    await render(<StreamPlayer compact initialMuted channels={streamsFor('dead-segments')} matchStatus="live" />);
    const first = activeDecoders()[0];
    await act(async () => first.emit('manifest'));
    await tick(30_001);
    expect(first.destroyed).toBe(true);
    expect(activeDecoders()[0].url).toContain(encodeURIComponent('backup.m3u8'));
    expect(container.textContent).toContain('Server took too long to respond');
  });

  it('waits for fresh signed links before retrying an exhausted tile, rather than replaying the expired URL', async () => {
    let generation = 0; let finishFresh;
    const originalFetch = fetcher.getMockImplementation();
    const stream = streamsFor('expired-signature')[0];
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).startsWith('/api/channels/')) {
        if (!generation) return json({ streams: [stream], matchStatus: 'live' });
        return new Promise((resolve) => { finishFresh = resolve; });
      }
      return originalFetch(url, init);
    });
    await render(<MultiStreamSlot source={{ type: 'channel', id: channels[0].id, title: 'Expiring source' }} />);
    await act(async () => activeDecoders()[0].emit('error', { fatal: true, type: 'networkError' }));
    expect(activeDecoders()).toHaveLength(0);
    generation = 1;
    await click(button('Retry now'));
    expect(container.textContent).toContain('Re-signing links');
    expect(media.instances).toHaveLength(1); // no attempt against the expired signature
    await act(async () => finishFresh(json({ streams: [{ ...stream, url: stream.url.replace('sig=test', 'sig=fresh') }], matchStatus: 'live' })));
    expect(activeDecoders()).toHaveLength(1);
    expect(activeDecoders()[0].url).toContain('sig=fresh');
    await readyVideos();
    expect(container.textContent).not.toContain('All servers failed');
  });

  it('aborts an unresolved tile when its source is replaced, ignoring stale resolution results', async () => {
    let finishOld; let oldSignal;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('old')) { oldSignal = init.signal; return new Promise((resolve) => { finishOld = resolve; }); }
      if (url === '/api/stream-health') return json({ health: {} });
      return json({ streams: streamsFor('new'), matchTitle: 'New channel', matchStatus: 'live' });
    });
    await render(<MultiStreamSlot key="old" source={{ type: 'channel', id: 'old', title: 'Old' }} />);
    await render(<MultiStreamSlot key="new" source={{ type: 'channel', id: 'new', title: 'New' }} />);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => finishOld(json({ streams: streamsFor('old'), matchTitle: 'Old' })));
    expect(activeDecoders()).toHaveLength(1);
    expect(activeDecoders()[0].url).toContain(encodeURIComponent('/new/'));
  });
});
