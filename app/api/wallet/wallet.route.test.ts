import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let match: any = { status: 'finished', homeScore: 2, awayScore: 1, timestamp: Date.now() };
vi.mock('@/lib/streamEngine', () => ({ getMatchDetails: vi.fn(async () => structuredClone(match)) }));

import { GET, POST } from './route';
import { resetWalletMemory, saveWallet, EMPTY_WALLET } from '@/lib/coins/server';
import { resetPredictionMemory, writeVote } from '@/lib/predictions/server';
import { WALLET_COOKIE } from '@/lib/coins/session';
import { REWARD_CORRECT_PREDICTION, VIP_PASS_COIN_COST } from '@/lib/coins';

const NOW = Date.parse('2026-10-16T12:00:00Z');
let viewerId = '';
let viewerCookie = '';

const call = (body?: unknown) =>
  body === undefined
    ? GET(new Request('https://limonlive.app/api/wallet', { headers: { cookie: `${WALLET_COOKIE}=${viewerCookie}` } }))
    : POST(new Request('https://limonlive.app/api/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `${WALLET_COOKIE}=${viewerCookie}` },
      body: JSON.stringify(body),
    }));

beforeEach(async () => {
  store.clear();
  resetWalletMemory();
  resetPredictionMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  match = { status: 'finished', homeScore: 2, awayScore: 1, timestamp: NOW };
  // Mint a real signed viewer cookie through the public API.
  const response = await GET(new Request('https://limonlive.app/api/wallet'));
  viewerCookie = response.headers.get('set-cookie')!.match(/limon_wallet_viewer=([^;]+)/)![1];
  // The signed cookie is `id.signature`; the wallet is keyed by the verified id.
  viewerId = viewerCookie.split('.')[0];
});

describe('GET /api/wallet', () => {
  it('issues a signed viewer cookie and reports an empty wallet for a new visitor', async () => {
    const body = await (await call()).json();
    expect(body).toMatchObject({ userId: viewerId, balance: 0, awards: [], redemptions: [], vipActive: false });
    expect(body.vipReward).toMatchObject({ id: 'vip-1-month', coins: VIP_PASS_COIN_COST, days: 30 });
  });
});

describe('POST /api/wallet {action:"settle"}', () => {
  it('pays a correct full-time prediction on the server and refuses to pay twice', async () => {
    await writeVote({ matchId: 'espn-1', userId: viewerId, username: 'Ultra', prediction: 'home', createdAt: NOW, updatedAt: NOW, changes: 0 });
    const first = await (await call({ action: 'settle', matchIds: ['espn-1'] })).json();
    expect(first).toMatchObject({ balance: REWARD_CORRECT_PREDICTION, credited: REWARD_CORRECT_PREDICTION });
    expect(first.settled[0]).toMatchObject({ matchId: 'espn-1', correct: true, coins: REWARD_CORRECT_PREDICTION });

    const replay = await (await call({ action: 'settle', matchIds: ['espn-1'] })).json();
    expect(replay).toMatchObject({ balance: REWARD_CORRECT_PREDICTION, credited: 0 });
    expect(replay.settled[0]).toMatchObject({ correct: true, coins: 0, reason: 'already-awarded' });
  });

  it('never pays a wrong pick, an unsettled match or a match this viewer never voted on', async () => {
    await writeVote({ matchId: 'espn-wrong', userId: viewerId, username: 'Ultra', prediction: 'away', createdAt: NOW, updatedAt: NOW, changes: 0 });
    const wrong = await (await call({ action: 'settle', matchIds: ['espn-wrong', 'espn-never-voted', 'espn-live'] })).json();
    expect(wrong.balance).toBe(0);
    expect(wrong.settled.map((row: any) => [row.matchId, row.reason])).toEqual([
      ['espn-wrong', 'wrong'], ['espn-never-voted', 'no-vote'], ['espn-live', 'no-vote'],
    ]);
  });

  it('creates no coins for a match still in play', async () => {
    match = { status: 'live', homeScore: 1, awayScore: 0, timestamp: NOW };
    await writeVote({ matchId: 'espn-live', userId: viewerId, username: 'Ultra', prediction: 'home', createdAt: NOW, updatedAt: NOW, changes: 0 });
    const body = await (await call({ action: 'settle', matchIds: ['espn-live'] })).json();
    expect(body.balance).toBe(0);
    expect(body.settled[0]).toMatchObject({ settled: false, reason: 'not-finished' });
  });

  it('sanitises the requested match ids (bounded, validated) and rejects unknown actions', async () => {
    const long = await (await call({ action: 'settle', matchIds: Array.from({ length: 80 }, (_, index) => `espn-${index}`) })).json();
    expect(long.settled.length).toBeLessThanOrEqual(40);
    const junk = await call({ action: 'settle', matchIds: ['../etc/passwd', { id: 'x' }, 'espn-legit'] });
    expect((await junk.json()).settled.map((row: any) => row.matchId)).toEqual(['espn-legit']);
    const unknown = await call({ action: 'gimme-coins' });
    expect(unknown.status).toBe(400);
  });

  it('ignores client-supplied balances completely', async () => {
    const body = await (await call({ action: 'settle', matchIds: [], balance: 9_000_000, coins: 9_000_000 })).json();
    expect(body.balance).toBe(0);
  });
});

describe('POST /api/wallet {action:"redeem"}', () => {
  it('refuses the VIP pass below 20,000 coins', async () => {
    await saveWallet(viewerId, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST - 1 });
    const response = await call({ action: 'redeem', reward: 'vip-1-month' });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ reason: 'insufficient-coins', cost: VIP_PASS_COIN_COST, balance: VIP_PASS_COIN_COST - 1 });
    expect(body.grant).toBeUndefined();
  });

  it('exchanges 20,000 coins for a one-month VIP grant and reports it as active', async () => {
    await saveWallet(viewerId, { ...EMPTY_WALLET, balance: VIP_PASS_COIN_COST });
    const body = await (await call({ action: 'redeem', reward: 'vip-1-month' })).json();
    expect(body).toMatchObject({ balance: 0, vipActive: true, redeemed: { id: 'vip-1-month', days: 30 } });
    expect(body.grant).toMatchObject({ planId: 'monthly', source: 'eviv-coins' });
    expect(body.vipExpiresAt).toBe(NOW + 30 * 86_400_000);

    const reloaded = await (await call()).json();
    expect(reloaded).toMatchObject({ balance: 0, vipActive: true });
    expect(reloaded.grant).toBeUndefined();
  });

  it('rejects unknown rewards', async () => {
    const response = await call({ action: 'redeem', reward: 'free-pony' });
    expect(response.status).toBe(400);
  });
});
