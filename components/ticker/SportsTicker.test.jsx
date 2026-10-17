// @vitest-environment happy-dom
/**
 * Phase 13 (Task 2): SportsTicker component regression tests.
 *
 * The pure item builder is covered in lib/ticker/tickerItems.test.ts; these
 * tests pin the component contract around it: verified rendering, the honest
 * empty state, 60s polling with cleanup, last-known-good retention on a
 * failed refresh, pause/resume, and the reduced-motion class contract.
 * The /api/matches fetch is stubbed — nothing here claims live provider data.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SportsTicker from './SportsTicker';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const H = 3600e3;
const liveMatch = () => ({
  id: 'm-live', status: 'live', tournament: 'Premier League', currentMinute: '67',
  homeScore: 1, awayScore: 0, timestamp: Date.now() - H,
  homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' },
});
const finishedMatch = () => ({
  id: 'm-ft', status: 'finished', tournament: 'Premier League',
  homeScore: 2, awayScore: 1, timestamp: Date.now() - 2 * H,
  homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' },
});
const okJson = (payload) => ({ ok: true, json: async () => payload });

let container;
let root;
let fetchMock;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock = vi.fn(async () => okJson({ matches: [liveMatch(), finishedMatch()] }));
  vi.stubGlobal('fetch', fetchMock);
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

const render = async () => {
  await act(async () => root.render(<SportsTicker />));
};
const visibleLinks = () => [...container.querySelectorAll('[data-ticker-track] a')].filter((a) => a.getAttribute('aria-hidden') !== 'true');

describe('SportsTicker (Phase 5 / Phase 13 Task 2)', () => {
  it('renders verified live and finished items from /api/matches, linked to their matches', async () => {
    await render();
    await vi.waitFor(() => expect(container.querySelector('[data-ticker-track]')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith('/api/matches', { cache: 'no-store' });
    expect(container.textContent).toContain('LIVE 67′ Arsenal 1–0 Chelsea');
    expect(container.textContent).toContain('FT Arsenal 2–1 Chelsea');
    const links = visibleLinks();
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/match/m-live', '/match/m-ft']);
    // Looped duplicates exist for the marquee but are hidden from AT/keyboard.
    const dupes = [...container.querySelectorAll('[data-ticker-track] a')].filter((a) => a.getAttribute('aria-hidden') === 'true');
    expect(dupes).toHaveLength(2);
    expect(dupes.every((a) => a.tabIndex === -1)).toBe(true);
  });

  it('shows the loading state until the first verified payload arrives', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    await render();
    expect(container.textContent).toContain('Loading verified scores…');
    expect(container.querySelector('[data-ticker-empty]')).toBeNull();
  });

  it('shows the honest empty state when nothing is verified', async () => {
    fetchMock.mockImplementation(async () => okJson({ matches: [] }));
    await render();
    await vi.waitFor(() => expect(container.querySelector('[data-ticker-empty]')).not.toBeNull());
    expect(container.querySelector('[data-ticker-empty]').textContent).toBe('No verified live scores or results to show right now.');
    expect(container.querySelector('[data-ticker-track]')).toBeNull();
    expect(container.querySelector('button[aria-label="Pause ticker"]')).toBeNull();
  });

  it('polls every 60s and stops polling after unmount', async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3); // interval cleaned up
    // afterEach unmounts again — make that a no-op-safe state.
    root = createRoot(container);
  });

  it('keeps last-known-good items when a refresh fails', async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(container.textContent).toContain('FT Arsenal 2–1 Chelsea');
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('FT Arsenal 2–1 Chelsea'); // retained, not blanked
    expect(container.querySelector('[data-ticker-empty]')).toBeNull();
    fetchMock.mockImplementation(async () => { throw new Error('network down'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(container.textContent).toContain('FT Arsenal 2–1 Chelsea');
  });

  it('pause/resume toggles the marquee state accessibly', async () => {
    await render();
    await vi.waitFor(() => expect(container.querySelector('button[aria-label="Pause ticker"]')).not.toBeNull());
    const track = () => container.querySelector('[data-ticker-track]');
    const button = () => container.querySelector('button[aria-pressed]');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    await act(async () => button().click());
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().getAttribute('aria-label')).toBe('Resume ticker');
    // One hover variant + one explicit paused utility while paused.
    expect(track().className.match(/animation-play-state:paused/g)).toHaveLength(2);
    await act(async () => button().click());
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(track().className.match(/animation-play-state:paused/g)).toHaveLength(1);
  });

  it('gates the marquee animation behind motion-safe (reduced-motion contract)', async () => {
    // happy-dom cannot evaluate the prefers-reduced-motion media query; the
    // verifiable contract is that the scroll animation exists ONLY under the
    // motion-safe variant, so reduced-motion users get a static strip.
    await render();
    await vi.waitFor(() => expect(container.querySelector('[data-ticker-track]')).not.toBeNull());
    const track = container.querySelector('[data-ticker-track]');
    expect(track.className).toContain('motion-safe:[animation:tickerScroll_45s_linear_infinite]');
    expect(track.className).not.toMatch(/(^|\s)\[animation:tickerScroll/); // never ungated
  });
});
