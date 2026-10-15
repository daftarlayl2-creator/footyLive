// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import StreamAutoResolver, { AUTO_RESOLVE_DELAYS_S, autoResolveDelay } from './StreamAutoResolver';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/watch/espn-9',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));

let container;
let root;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const render = async (element) => { await act(async () => root.render(element)); };
const advance = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const STREAMS = [
  { name: 'Provider A', url: 'https://provider-a.example/embed/9', kind: 'embed', provider: 'streamed' },
  { name: 'CCTV-5', url: 'https://provider-b.example/embed/9', kind: 'embed', provider: 'guovin-fallback-sports' },
];

// Provider frames load a tiny local page (no network), as in the player suite.
const iframeSettings = {};
beforeAll(() => {
  const settings = window.happyDOM.settings;
  Object.assign(iframeSettings, {
    enableIframePageLoading: settings.enableIframePageLoading,
    disableIframePageLoading: settings.disableIframePageLoading,
    interceptor: settings.fetch.interceptor,
  });
  settings.enableIframePageLoading = true;
  settings.disableIframePageLoading = false;
  settings.fetch.interceptor = {
    beforeAsyncRequest: async () => new window.Response('<p>Provider player</p>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  };
});
afterAll(() => {
  const settings = window.happyDOM.settings;
  settings.enableIframePageLoading = iframeSettings.enableIframePageLoading;
  settings.disableIframePageLoading = iframeSettings.disableIframePageLoading;
  settings.fetch.interceptor = iframeSettings.interceptor;
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StreamAutoResolver', () => {
  it('backs off between automatic checks and repeats the slowest pace', () => {
    expect(AUTO_RESOLVE_DELAYS_S).toEqual([6, 12, 20, 30, 45, 60]);
    expect([0, 1, 2, 5, 6, 40].map(autoResolveDelay)).toEqual([6, 12, 20, 60, 60, 60]);
    expect(autoResolveDelay(-3)).toBe(6);
  });

  it('keeps re-resolving a live match and mounts the player once a server appears', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: 'Streams are temporarily unavailable.', streams: [], matchStatus: 'live' }, 503))
      .mockResolvedValueOnce(json({ matchTitle: 'Arsenal vs Liverpool', matchStatus: 'live', streams: STREAMS, defaultUrl: STREAMS[0].url }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<StreamAutoResolver matchId="espn-9" matchTitle="Arsenal vs Liverpool" />);

    // No dead end: a searching state with a visible countdown instead of "Stream is Offline".
    expect(container.textContent).not.toContain('Offline');
    expect(container.querySelector('[data-stream-resolver="searching"]')).not.toBeNull();
    expect(container.textContent).toContain('Finding a live stream');
    expect(container.querySelector('[data-auto-resolve]').textContent).toContain('Next check in 6s');

    await advance(6000);
    expect(fetchMock).toHaveBeenCalledWith('/api/streams/espn-9', expect.objectContaining({ cache: 'no-store' }));
    expect(container.querySelector('[data-auto-resolve]').textContent).toContain('Next check in 12s');

    await advance(12000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-stream-resolver]')).toBeNull();
    expect(container.querySelector('iframe[data-player-frame]').getAttribute('src')).toBe(STREAMS[0].url);
  });

  it('checks immediately on request', async () => {
    const fetchMock = vi.fn(async () => json({ streams: STREAMS, matchStatus: 'live' }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<StreamAutoResolver matchId="espn-9" />);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Check now'));
    await act(async () => button.click());
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('iframe[data-player-frame]')).not.toBeNull();
  });

  it('stops at full time and for fixtures the provider no longer lists', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'Match not found' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    await render(<StreamAutoResolver matchId="espn-9" matchStatus="finished" />);
    await advance(120000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-stream-resolver="finished"]')).not.toBeNull();
    expect(container.querySelector('a[href="/highlights"]')).not.toBeNull();

    await render(<StreamAutoResolver key="live" matchId="espn-9" matchStatus="live" />);
    await advance(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-stream-resolver="missing"]')).not.toBeNull();
    await advance(120000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
