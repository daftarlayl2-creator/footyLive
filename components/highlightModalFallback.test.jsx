// @vitest-environment happy-dom
/**
 * Phase 13 (Task 3): HighlightPlayerModal embed-failure fallback tests.
 *
 * Pins the Phase 8 behavior with fake timers and synthetic iframe events:
 * load success keeps the player clean, load error and the 6-second slow
 * deadline surface the authorized fallback (official YouTube watch page —
 * never a proxy), and timers/state are keyed per video and cleaned up.
 * happy-dom does not play real YouTube embeds; nothing here claims browser
 * playback verification.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HighlightPlayerModal from './HighlightPlayerModal';

const highlight = (videoId = 'abc123') => ({
  id: `yt-${videoId}`,
  videoId,
  title: 'Arsenal vs Chelsea — Highlights',
  url: `https://www.youtube.com/watch?v=${videoId}`,
  date: '2026-10-17T12:00:00Z',
  views: 0,
});

let container;
let root;

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
});

const render = async (hl) => {
  await act(async () => root.render(<HighlightPlayerModal highlight={hl} onClose={() => {}} />));
};
const advance = async (ms) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};
const fireOnIframe = async (type) => {
  const iframe = container.querySelector('iframe');
  expect(iframe).not.toBeNull();
  // happy-dom limitation (probe-verified): a natively dispatched load/error
  // event reaches DOM listeners but never React's handlers in this
  // environment. So invoke the exact React prop the browser event would
  // call — the state machine and rendering under test remain the product's
  // own; only the browser's event delivery is simulated.
  const propsKey = Object.keys(iframe).find((k) => k.startsWith('__reactProps'));
  const handler = type === 'load' ? iframe[propsKey]?.onLoad : iframe[propsKey]?.onError;
  expect(typeof handler).toBe('function');
  await act(async () => { handler(new window.Event(type)); });
};
const fallback = () => container.querySelector('[data-highlight-fallback]');
const fallbackLink = () => [...container.querySelectorAll('[data-highlight-fallback] a')][0];

describe('HighlightPlayerModal fallback (Phase 8 / Phase 13 Task 3)', () => {
  it('embed load success: player becomes ready and no fallback ever appears', async () => {
    await render(highlight());
    const iframe = container.querySelector('iframe');
    expect(iframe.getAttribute('src')).toContain('https://www.youtube.com/embed/abc123');
    await fireOnIframe('load');
    await advance(10_000); // well past the 6s deadline
    expect(fallback()).toBeNull();
  });

  it('embed load error: fallback offers the official YouTube watch page', async () => {
    await render(highlight());
    await fireOnIframe('error');
    expect(fallback()).not.toBeNull();
    expect(fallback().textContent).toContain('The embedded player could not load.');
    expect(fallbackLink().textContent).toContain('Watch it on YouTube');
    expect(fallbackLink().getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('slow load: fallback appears only once the 6-second deadline passes', async () => {
    await render(highlight());
    await advance(5_999);
    expect(fallback()).toBeNull();
    await advance(1);
    expect(fallback()).not.toBeNull();
    expect(fallback().textContent).toContain('The player is taking a while');
    expect(fallbackLink().getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('late load after the slow fallback recovers the player', async () => {
    await render(highlight());
    await advance(6_000);
    expect(fallback()).not.toBeNull();
    await fireOnIframe('load');
    expect(fallback()).toBeNull();
  });

  it('state and timers are keyed per video: switching highlights resets the deadline', async () => {
    await render(highlight('first1'));
    await fireOnIframe('error');
    expect(fallback()).not.toBeNull(); // first video failed
    await render(highlight('second2'));
    expect(fallback()).toBeNull(); // fresh video, no inherited failure
    await advance(5_999);
    expect(fallback()).toBeNull(); // second video gets its own full deadline
    await advance(1);
    expect(fallback()).not.toBeNull();
    expect(fallbackLink().getAttribute('href')).toBe('https://www.youtube.com/watch?v=second2');
  });

  it('cleans up its timer on unmount (no state updates afterwards)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(highlight());
    await act(async () => root.unmount());
    await advance(10_000); // would fire the deadline if it leaked
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    root = createRoot(container); // keep afterEach unmount safe
  });
});
