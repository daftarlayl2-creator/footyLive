// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TacticalRadarPlayer from './TacticalRadarPlayer';
import StreamAutoResolver from '@/components/StreamAutoResolver';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/watch/espn-9',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/components/subscription/SubscriptionProvider', () => ({
  useSubscription: () => ({ access: { tier: 'elite', grants: {} } }),
}));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };

describe('tactical radar visibility sprint', () => {
  it('keeps the header chip by default and hides it under a host badge (chrome={false})', async () => {
    await render(<TacticalRadarPlayer matchId="espn-9" title="Arsenal vs Liverpool" />);
    expect(container.textContent).toContain('Tactical Radar · Backup');

    await render(<TacticalRadarPlayer key="bare" matchId="espn-9" compact chrome={false} />);
    expect(container.textContent).not.toContain('Tactical Radar · Backup');
    // The stats dock and its "not live data" honesty label always stay.
    expect(container.querySelector('[data-radar-dock]')).not.toBeNull();
    expect(container.textContent).toContain('Simulated match stats');
    expect(container.textContent).toContain('not live data');
  });

  it('the stats dock never intercepts taps on the pitch', async () => {
    await render(<TacticalRadarPlayer matchId="espn-9" />);
    expect(container.querySelector('[data-radar-dock]').className).toContain('pointer-events-none');
  });

  it('searching fallback: radar stage with a compact, non-blocking top status badge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ streams: [], matchStatus: 'live' }), { status: 503 })));
    await render(<StreamAutoResolver matchId="espn-9" matchTitle="Arsenal vs Liverpool" />);

    const stage = container.querySelector('[data-stream-resolver="searching"]');
    expect(stage).not.toBeNull();
    // The mini status badge is top-aligned and carries the search state…
    const banner = container.querySelector('[data-search-banner]');
    expect(banner).not.toBeNull();
    expect(banner.className).toContain('top-0');
    expect(banner.textContent).toContain('Finding a live stream');
    // …with the live countdown and manual check still reachable…
    expect(container.querySelector('[data-auto-resolve]').textContent).toContain('Next check in');
    const checkNow = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Check now'));
    expect(checkNow).not.toBeNull();
    expect(container.querySelector('a[href="/channels"]')).not.toBeNull();
    // …and the old blocking treatment is gone: no full-stage dim over the radar.
    const dims = [...stage.querySelectorAll(':scope > div')].filter((node) => node.className.includes('bg-black/45'));
    expect(dims).toHaveLength(0);
    // The radar is the stage: no "Stream is Offline" dead end anywhere.
    expect(container.textContent).not.toContain('Offline');
  });
});
