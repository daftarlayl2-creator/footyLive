// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

import VotingBar from './VotingBar';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';

let container;
let root;
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
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const render = async (element) => { await act(async () => root.render(element)); };
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

/** Server double: the prediction API plus the wallet the component mirrors. */
function stubServer(overrides = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, init) => {
    const target = String(url);
    calls.push({ url: target, body: init?.body ? JSON.parse(init.body) : null });
    if (target === '/api/wallet') return { ok: true, json: async () => ({ balance: 500, awards: [], redemptions: [] }) };
    if (target.startsWith('/api/predictions/')) {
      if (init?.method === 'POST') {
        const payload = overrides.post || { counts: { home: 1, draw: 0, away: 0 }, total: 1, mine: 'home', locked: false, reward: REWARD_CORRECT_PREDICTION, verified: true, credited: 0 };
        return { ok: payload.__status !== 409 ? true : false, status: payload.__status || 200, json: async () => payload };
      }
      const payload = overrides.get || { counts: { home: 4, draw: 2, away: 3 }, total: 9, mine: null, locked: false, reward: REWARD_CORRECT_PREDICTION, verified: true };
      return { ok: true, json: async () => payload };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

const bar = (extra = {}) => (
  <VotingBar matchId="espn-700001" homeTeam={{ name: 'Arsenal', badge: '' }} awayTeam={{ name: 'Liverpool', badge: '' }} status="upcoming" {...extra} />
);
const voteButton = (label) => [...container.querySelectorAll('button')].find((button) => (button.getAttribute('aria-label') || '').startsWith(label));

describe('predictions are server-verified', () => {
  it('shows the server tally and the coin reward a correct call is worth', async () => {
    stubServer();
    await render(bar());
    await settle();
    expect(container.textContent).toContain('9 votes');
    expect(container.querySelector('[data-prediction-reward]').getAttribute('data-prediction-reward')).toBe(String(REWARD_CORRECT_PREDICTION));
    expect(container.textContent).toContain(`+${REWARD_CORRECT_PREDICTION.toLocaleString('en-US')}`);
    expect(container.textContent).toContain(`${REWARD_CORRECT_PREDICTION.toLocaleString('en-US')} EVIV Coins if you are right`);
    expect(container.textContent).toContain('Tap a result to cast your vote');
    // Percentages come from the backend tally (4/9 → 44%).
    expect(voteButton('Arsenal to win').getAttribute('aria-label')).toBe('Arsenal to win — 45%');
    expect(container.textContent).toContain('4 home');
  });

  it('posts the pick to the server and reports that it was verified', async () => {
    const { calls } = stubServer();
    await render(bar());
    await settle();
    await act(async () => voteButton('Arsenal to win').click());
    await settle();
    const post = calls.find((call) => call.url.startsWith('/api/predictions/') && call.body);
    expect(post).toBeTruthy();
    expect(post.body).toMatchObject({ prediction: 'home' });
    expect(container.textContent).toContain('verified on the server');
  });

  it('locks the options the moment the server says the match kicked off', async () => {
    stubServer({
      get: { counts: { home: 1, draw: 0, away: 0 }, total: 1, mine: null, locked: true, reward: REWARD_CORRECT_PREDICTION },
      post: { __status: 409, error: 'Predictions are locked: this match has already kicked off.', locked: true, counts: { home: 1, draw: 0, away: 0 }, total: 1, mine: null },
    });
    await render(bar());
    await settle();
    expect(container.textContent).toContain('Locked at kick-off');
    expect(container.querySelectorAll('button[aria-disabled="true"]')).toHaveLength(3);
    // A tap on a locked bar is a no-op, not a silent local vote.
    await act(async () => voteButton('Liverpool to win').click());
    await settle();
    expect(window.localStorage.getItem('eviv:vote:espn-700001')).toBeNull();
  });

  it('overwrites a locally tampered vote with the server’s own record', async () => {
    window.localStorage.setItem('eviv:vote:espn-700001', JSON.stringify({ id: 'fake', prediction: 'home', at: 1 }));
    stubServer({
      get: { counts: { home: 0, draw: 0, away: 3 }, total: 3, mine: 'away', locked: false, reward: REWARD_CORRECT_PREDICTION },
      post: { __status: 409, error: 'refused', locked: false, counts: { home: 0, draw: 0, away: 3 }, total: 3, mine: 'away' },
    });
    await render(bar());
    await settle();
    // The server tally wins over the three fabricated votes.
    expect(container.textContent).toContain('3 votes');
    expect(container.textContent).toContain('Your pick: Liverpool');
    await act(async () => voteButton('Arsenal to win').click());
    await settle();
    expect(container.textContent).toContain('refused by the server');
    expect(JSON.parse(window.localStorage.getItem('eviv:vote:espn-700001')).prediction).toBe('away');
  });

  it('mirrors a server-credited reward into the wallet without ever minting coins itself', async () => {
    stubServer({
      post: { counts: { home: 1, draw: 0, away: 0 }, total: 1, mine: 'home', locked: false, reward: REWARD_CORRECT_PREDICTION, credited: REWARD_CORRECT_PREDICTION },
    });
    await render(bar());
    await settle();
    await act(async () => voteButton('Arsenal to win').click());
    await settle();
    expect(container.textContent).toContain(`+${REWARD_CORRECT_PREDICTION.toLocaleString('en-US')} EVIV Coins credited to your wallet`);
    // The local cache is only a mirror of the server-confirmed balance.
    expect(JSON.parse(window.localStorage.getItem('eviv:coins'))).toMatchObject({ balance: 500 });
  });

  it('keeps working offline: the vote stays on the device and says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await render(bar());
    await settle();
    await act(async () => voteButton('Arsenal to win').click());
    await settle();
    expect(container.textContent).toContain('saved on this device');
    expect(JSON.parse(window.localStorage.getItem('eviv:vote:espn-700001')).prediction).toBe('home');
  });
});
