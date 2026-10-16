// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';
import TacticalRadarPlayer from './player/TacticalRadarPlayer';
import LemonWheel from './spin/LemonWheel';
import SpinHub from './spin/SpinHub';
import LeaderboardTable from './leaderboard/LeaderboardTable';
import LiveReactions from './reactions/LiveReactions';
import MatchCard from './MatchCard';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/spin',
  useSearchParams: () => new URLSearchParams(),
}));

const auth = vi.hoisted(() => ({ current: { status: 'authenticated', user: { id: 'u1', name: 'Ultra' }, provider: 'local' } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth.current }));
vi.mock('@/lib/sound/uiSound', async (original) => ({ ...(await original()), playSound: vi.fn() }));
vi.mock('@/lib/sound/soundboard', async (original) => ({ ...(await original()), playSoundboardSound: vi.fn(() => true) }));

let container;
let root;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const render = async (element) => { await act(async () => root.render(element)); };
/** Let deferred effect kickoffs (setTimeout(load, 0)) and their fetches settle. */
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
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

/* -------------------------------------------------------------------------- */
/*  Component error isolation                                                  */
/* -------------------------------------------------------------------------- */

function Boom({ label }) {
  if (label) throw new Error(`API glitch in ${label}`);
  return <section data-ok="">fine</section>;
}

describe('section error boundaries', () => {
  it('isolates a crashed subtree and recovers via Try again', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(
      <div>
        <ErrorBoundary name="match-grid" resetKeys={['a']}>
          <Boom label="match grid" />
        </ErrorBoundary>
        <ErrorBoundary name="inbox">
          <Boom />
        </ErrorBoundary>
      </div>
    );
    // The healthy section kept rendering — one glitch never takes the page down.
    expect(container.querySelector('[data-section-error="match-grid"]')).not.toBeNull();
    expect(container.querySelector('[data-ok]')).not.toBeNull();
    expect(container.textContent).toContain('This section hit a snag');

    const button = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Try again'));
    await act(async () => button.click());
    // Reset re-opens the subtree; the same child crashes again inside its own box.
    expect(container.querySelector('[data-section-error="match-grid"]')).not.toBeNull();
    errors.mockRestore();
  });

  it('re-opens automatically when its resetKeys change', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Flip = ({ flip }) => (
      <ErrorBoundary name="rewards-drawer" resetKeys={[flip]}>
        <Boom label={flip ? 'boom' : ''} />
      </ErrorBoundary>
    );
    await render(<Flip flip />);
    expect(container.querySelector('[data-section-error="rewards-drawer"]')).not.toBeNull();
    await render(<Flip flip={false} />);
    expect(container.querySelector('[data-ok]')).not.toBeNull();
    errors.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/*  Interactive backup player — tactical radar                                 */
/* -------------------------------------------------------------------------- */

describe('tactical radar backup player', () => {
  it('renders the radar stage with simulated match stats — never a black screen', async () => {
    await render(<TacticalRadarPlayer matchId="espn-700001" title="Arsenal vs Liverpool" />);
    expect(container.querySelector('[data-tactical-radar]')).not.toBeNull();
    expect(container.querySelector('[data-tactical-radar-match]').getAttribute('data-tactical-radar-match')).toBe('espn-700001');
    expect(container.textContent).toContain('Tactical Radar');
    expect(container.textContent).toContain('Simulated match stats');
    expect(container.textContent).toContain('Arsenal vs Liverpool');
    for (const label of ['Possession', 'Shots', 'On target', 'Corners', 'Fouls']) {
      expect(container.querySelector(`[data-sim-stat="${label}"]`)).not.toBeNull();
    }
    // Simulated data is always labelled as such — never mistaken for live stats.
    expect(container.textContent).toContain('Simulated');
  });

  it('releases every timer on unmount (no leaked intervals)', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    await render(<TacticalRadarPlayer matchId="espn-1" />);
    await act(async () => root.unmount());
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    // Recreate the root for the shared afterEach unmount.
    root = createRoot(container);
  });
});

/* -------------------------------------------------------------------------- */
/*  Daily Lemon Wheel                                                          */
/* -------------------------------------------------------------------------- */

describe('Daily Lemon Wheel (/spin)', () => {
  it('renders the 3D wheel with segments, spin button and prize list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      prizes: [
        { id: 'coins-500', kind: 'coins', label: '500 Coins', labelAr: '', rarity: 'common', coins: 500 },
        { id: 'vip-24h', kind: 'vip', label: '24h VIP Pass', labelAr: '', rarity: 'epic', coins: null },
      ],
      minCoins: 100, maxCoins: 5000, cooldownMs: 86400000,
      canSpin: true, nextSpinAt: null, lastSpinAt: null, lastPrize: null, history: [],
    })));
    await render(<SpinHub />);
    await flush();
    expect(container.querySelector('[data-lemon-wheel]')).not.toBeNull();
    expect(container.querySelector('[data-wheel-face]')).not.toBeNull();
    expect(container.querySelector('[data-spin-button]').disabled).toBe(false);
    expect(container.textContent).toContain('Daily Lemon Wheel');
    expect(container.textContent).toContain('500 Coins');
    expect(container.textContent).toContain('24h VIP Pass');
  });

  it('gates the wheel behind a registered account', async () => {
    auth.current = { status: 'guest', user: null, provider: 'local' };
    vi.stubGlobal('fetch', vi.fn(async () => json({ prizes: [], canSpin: false, nextSpinAt: 1, history: [] })));
    await render(<SpinHub />);
    expect(container.querySelector('[data-lemon-wheel]')).toBeNull();
    expect(container.textContent).toContain('registered');
    auth.current = { status: 'authenticated', user: { id: 'u1', name: 'Ultra' }, provider: 'local' };
  });

  it('lands the wheel on the server-chosen segment and shows the prize', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ prizes: [], canSpin: true, nextSpinAt: null, history: [] }))
      .mockResolvedValueOnce(json({
        ok: true,
        prize: { id: 'coins-500', kind: 'coins', label: '500 Coins', rarity: 'common' },
        record: { prizeId: 'coins-500', kind: 'coins', coins: 500, at: 1 },
        canSpin: false, nextSpinAt: 2, history: [],
      }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<SpinHub />);
    await flush();
    const button = container.querySelector('[data-spin-button]');
    await act(async () => button.click());
    await flush();
    expect(container.querySelector('[data-spin-result]').textContent).toContain('500 Coins');
    expect(fetchMock).toHaveBeenCalledWith('/api/spin', expect.objectContaining({ method: 'POST' }));
  });

  it('drives the wheel rotation to the exact winning segment (server-side draw)', async () => {
    await render(<LemonWheel resultPrizeId="coins-500" />);
    const face = container.querySelector('[data-wheel-face]');
    const rotation = Number(face.getAttribute('data-wheel-rotation'));
    // The prize index + 6 full turns decide the landing; nothing else can.
    const { targetRotation, prizeIndex } = await import('@/lib/spin/prizes');
    expect(rotation).toBe(Math.round(targetRotation('coins-500', 6, 0)));
    expect(prizeIndex('coins-500')).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Global leaderboard                                                         */
/* -------------------------------------------------------------------------- */

describe('global predictor leaderboard (/leaderboard)', () => {
  it('renders the live ranking with accuracy, streaks and active badges', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      rows: [
        {
          rank: 1, userId: 'u-1', handle: 'Ultra', settled: 10, correct: 9, wrong: 1,
          accuracy: 90, streak: 4, bestStreak: 6,
          badges: [{ id: 'hot-hand', label: 'Hot Hand', emoji: '🔥' }],
          seeded: false, lastOutcomeAt: 1,
        },
        {
          rank: 2, userId: 'u-2', handle: 'Meh', settled: 8, correct: 3, wrong: 5,
          accuracy: 38, streak: 0, bestStreak: 2, badges: [], seeded: true, lastOutcomeAt: 2,
        },
      ],
      me: { userId: 'u-1', rank: 1, accuracy: 90, streak: 4 },
      updatedAt: 1,
    })));
    await render(<LeaderboardTable />);
    await flush();
    expect(container.querySelector('[data-leaderboard-table]')).not.toBeNull();
    expect(container.querySelectorAll('[data-leaderboard-row]')).toHaveLength(2);
    expect(container.querySelector('[data-leaderboard-row="1"]').textContent).toContain('Ultra');
    expect(container.querySelector('[data-leaderboard-row="1"]').textContent).toContain('Hot Hand');
    expect(container.querySelector('[data-leaderboard-row="1"] [data-accuracy]').textContent).toBe('90%');
    expect(container.querySelector('[data-leaderboard-row="1"] [data-streak]').textContent).toContain('4');
    expect(container.querySelector('[data-leaderboard-me]').textContent).toContain('rank');
  });

  it('keeps polling on a timer and clears every handle on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json({ rows: [], me: null, updatedAt: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<LeaderboardTable />);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const before = fetchMock.mock.calls.length;
    await act(async () => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock.mock.calls.length).toBe(before);
    root = createRoot(container); // shared afterEach unmounts again
  });
});

/* -------------------------------------------------------------------------- */
/*  Match soundboard & live reactions                                          */
/* -------------------------------------------------------------------------- */

describe('match soundboard & live reactions', () => {
  it('floats the four reaction bubbles over the stream with live counters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ counts: { fire: 12, goalCheer: 3, whistle: 0, lemonVibe: 7 } }))
      .mockResolvedValue(json({ ok: true, counted: true, counts: { fire: 12, goalCheer: 4, whistle: 0, lemonVibe: 7 } }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<LiveReactions matchId="espn-700001" />);
    expect(container.querySelector('[data-live-reactions-match]').getAttribute('data-live-reactions-match')).toBe('espn-700001');
    for (const kind of ['fire', 'goalCheer', 'whistle', 'lemonVibe']) {
      expect(container.querySelector(`[data-reaction-button="${kind}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-reaction-count="fire"]').textContent).toBe('12');

    // Tapping spawns a floating bubble, plays its soundboard tone and bumps the counter.
    await act(async () => container.querySelector('[data-reaction-button="goalCheer"]').click());
    expect(container.querySelector('[data-reaction-bubble="goalCheer"]')).not.toBeNull();
    expect(container.querySelector('[data-reaction-count="goalCheer"]').textContent).toBe('4');
    expect(fetchMock).toHaveBeenCalledWith('/api/reactions/espn-700001', expect.objectContaining({ method: 'POST' }));
  });

  it('cleans its poll interval up on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json({ counts: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await render(<LiveReactions matchId="espn-2" />);
    const before = fetchMock.mock.calls.length;
    await act(async () => root.unmount());
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchMock.mock.calls.length).toBe(before);
    root = createRoot(container);
  });
});

/* -------------------------------------------------------------------------- */
/*  Hydration hygiene                                                          */
/* -------------------------------------------------------------------------- */

describe('SSR/CSR hydration', () => {
  it('MatchCard hydrates its server HTML with zero mismatches', async () => {
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')); });
    const fixture = {
      id: 'espn-700002', title: 'Real Madrid vs Barcelona', status: 'upcoming', source: 'espn',
      timestamp: Date.now() + 90 * 60 * 1000,
      tournament: 'LaLiga', homeTeam: { name: 'Real Madrid', badge: '' }, awayTeam: { name: 'Barcelona', badge: '' },
      sources: [], homeScore: 0, awayScore: 0, currentMinute: '', currentMinuteNumber: 0,
    };
    const html = renderToStaticMarkup(<MatchCard match={fixture} tab="upcoming" />);
    expect(html).toContain('Kickoff in');

    // Hydrate the server HTML in a dedicated container (React reports text
    // mismatches through console.error — none may fire).
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    let tree;
    await act(async () => { tree = hydrateRoot(host, <MatchCard match={fixture} tab="upcoming" />); });
    await act(async () => tree.unmount());
    host.remove();
    const hydrationErrors = errors.filter((message) => String(message).includes('Hydration') || String(message).includes('did not match'));
    expect(hydrationErrors).toEqual([]);
    spy.mockRestore();
  });
});
