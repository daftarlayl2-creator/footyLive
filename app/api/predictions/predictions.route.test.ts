import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Server store double: the wallet/vote records live outside the route under test. */
const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/** Real fixture facts the route is allowed to trust. */
const match = { status: 'upcoming', homeScore: undefined, awayScore: undefined, timestamp: Date.parse('2026-10-16T19:00:00Z') };
vi.mock('@/lib/streamEngine', () => ({ getMatchDetails: vi.fn(async () => structuredClone(match)) }));

import { getMatchDetails } from '@/lib/streamEngine';
import { GET, POST } from './[matchId]/route';
import { resetPredictionMemory } from '@/lib/predictions/server';
import { resetWalletMemory } from '@/lib/coins/server';
import { WALLET_COOKIE } from '@/lib/coins/session';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const params = { params: Promise.resolve({ matchId: 'espn-700001' }) };

const post = (body: unknown, cookie?: string) =>
  POST(new Request('https://limonlive.app/api/predictions/espn-700001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie: `${WALLET_COOKIE}=${cookie}` } : {}) },
    body: JSON.stringify(body),
  }), params);

const get = (cookie?: string) =>
  GET(new Request('https://limonlive.app/api/predictions/espn-700001', {
    headers: cookie ? { cookie: `${WALLET_COOKIE}=${cookie}` } : {},
  }), params);

const setCookie = (response: Response) => response.headers.get('set-cookie')?.match(/limon_wallet_viewer=([^;]+)/)?.[1] || null;

async function viewerCookie(): Promise<string> {
  const response = await get();
  const cookie = setCookie(response);
  expect(cookie).toBeTruthy();
  return cookie!;
}

beforeEach(() => {
  store.clear();
  resetPredictionMemory();
  resetWalletMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.mocked(getMatchDetails).mockImplementation(async () => structuredClone(match) as any);
});

describe('POST /api/predictions/{matchId} — server-enforced rules', () => {
  it('mints a signed viewer cookie and accepts a legal vote for a fixture that has not started', async () => {
    const response = await post({ prediction: 'home', username: 'Ultra' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ verified: true, mine: 'home', total: 1, locked: false, reward: REWARD_CORRECT_PREDICTION });
    expect(body.counts).toEqual({ home: 1, draw: 0, away: 0 });
    expect(setCookie(response)).toBeTruthy();
  });

  it('keeps one vote per user_id + match_id: a second call changes the pick instead of adding a row', async () => {
    const cookie = await viewerCookie();
    await post({ prediction: 'home' }, cookie);
    const changed = await post({ prediction: 'away' }, cookie);
    const body = await changed.json();
    expect(body).toMatchObject({ mine: 'away', total: 1, change: true });
    expect(body.counts).toEqual({ home: 0, draw: 0, away: 1 });
    // Reloading the page reports the same single vote.
    expect(await (await get(cookie)).json()).toMatchObject({ mine: 'away', total: 1 });
  });

  it('refuses votes from two different viewers being counted once, and counts distinct fans separately', async () => {
    const first = await viewerCookie();
    const second = await viewerCookie();
    expect(first).not.toBe(second);
    await post({ prediction: 'home' }, first);
    const body = await (await post({ prediction: 'draw' }, second)).json();
    expect(body.counts).toEqual({ home: 1, draw: 1, away: 0 });
    expect(body.total).toBe(2);
    expect(body.mine).toBe('draw');
  });

  it('ignores a forged cookie instead of trusting a client-supplied user id', async () => {
    const forged = await post({ prediction: 'home', userId: 'attacker-controlled', username: 'Ultra' }, 'not-a-real-cookie');
    expect(forged.status).toBe(200);
    // The forged id was dropped and a genuine signed viewer cookie issued instead.
    const issued = setCookie(forged);
    expect(issued).toBeTruthy();
    const body = await forged.json();
    expect(body).toMatchObject({ verified: true, mine: 'home', total: 1 });
    // The attacker-chosen id is not the id the vote was stored under.
    const reloaded = await (await get(issued!)).json();
    expect(reloaded).toMatchObject({ mine: 'home', total: 1 });
    expect(await (await get('a3f1c2d4-1111-4222-8333-444455556666.deadbeef')).json()).toMatchObject({ mine: null });
  });

  it('rejects illegal outcomes and malformed match ids', async () => {
    expect((await post({ prediction: 'banana' })).status).toBe(409);
    const bad = await POST(new Request('https://limonlive.app/api/predictions/..%2Fadmin', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ matchId: '../admin' }),
    });
    expect(bad.status).toBe(400);
  });

  it('locks automatically at kick-off (a pre-kick-off vote stands, later ones are refused)', async () => {
    const cookie = await viewerCookie();
    expect((await post({ prediction: 'home' }, cookie)).status).toBe(200);

    vi.setSystemTime(match.timestamp + 1);
    const late = await post({ prediction: 'away' }, cookie);
    expect(late.status).toBe(409);
    const body = await late.json();
    expect(body).toMatchObject({ locked: true, reason: 'locked-kickoff', mine: 'home' });
    // The original vote was not overwritten by the refused change.
    expect((await (await get(cookie)).json())).toMatchObject({ mine: 'home', locked: true });
  });

  it('never accepts a vote for a match already in play or finished', async () => {
    vi.mocked(getMatchDetails).mockResolvedValue({ status: 'live', timestamp: NOW } as any);
    expect((await post({ prediction: 'home' })).status).toBe(409);
    vi.mocked(getMatchDetails).mockResolvedValue({ status: 'finished', homeScore: 2, awayScore: 0, timestamp: NOW } as any);
    const finished = await post({ prediction: 'home' });
    expect(finished.status).toBe(409);
    expect((await finished.json()).reason).toBe('locked-finished');
  });

  it('rejects invalid JSON bodies without touching the store', async () => {
    const response = await POST(new Request('https://limonlive.app/api/predictions/espn-700001', { method: 'POST', body: '{oops' }), params);
    expect(response.status).toBe(400);
    expect(await (await get()).json()).toMatchObject({ total: 0 });
  });
});

describe('GET /api/predictions/{matchId}', () => {
  it('reports the server tally, the lock state and this viewer’s pick', async () => {
    const cookie = await viewerCookie();
    await post({ prediction: 'draw' }, cookie);
    const body = await (await get(cookie)).json();
    expect(body).toMatchObject({ total: 1, mine: 'draw', locked: false, status: 'upcoming', verified: true });
    expect(body.kickoff).toBe(match.timestamp);
    // Another viewer sees the tally but no pick of their own.
    expect(await (await get(await viewerCookie())).json()).toMatchObject({ total: 1, mine: null });
  });

  it('rejects invalid match ids', async () => {
    const response = await GET(new Request('https://limonlive.app/api/predictions/x'), { params: Promise.resolve({ matchId: 'bad id!' }) });
    expect(response.status).toBe(400);
  });
});
