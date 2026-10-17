/**
 * Phase 13 (Task 4): route-level tests for /api/community/submissions.
 *
 * Exercises the real route handlers and the real staff guard (tokens minted
 * with the production helpers): validation, honeypot, per-IP throttling,
 * 401/403/200 authorization boundaries, moderation actions, reporting, and
 * the structural guarantee that moderation only ever writes the submissions
 * store — verified match data lives elsewhere and is never touched here.
 * Only the cache layer is substituted (in-memory, same pattern as the admin
 * route tests), so nothing needs Redis/Supabase credentials.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  const g = globalThis as { __LIMON_TEST_CACHE_STORE__?: Map<string, unknown> };
  if (!g.__LIMON_TEST_CACHE_STORE__) g.__LIMON_TEST_CACHE_STORE__ = new Map<string, unknown>();
  const store = g.__LIMON_TEST_CACHE_STORE__;
  return {
    getCacheManager: () => ({
      get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
      set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
    }),
    __resetStore: () => store.clear(),
  };
});
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import * as cacheManagerMock from '@/lib/cache/cacheManager';
import { GET, PATCH, POST } from './route';
import { listSubmissions, resetSubmissionMemory } from '@/lib/community/submissions';
import { ADMIN_SESSION_COOKIE, createStaffSessionToken } from '@/lib/adminAuth';

const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;
const cacheStore = () => (globalThis as unknown as { __LIMON_TEST_CACHE_STORE__: Map<string, unknown> }).__LIMON_TEST_CACHE_STORE__;

const URL_ = 'http://limon.test/api/community/submissions';
let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter += 1)}`; // unique IP per test ⇒ throttle isolation

const post = (body: unknown, ip = nextIp(), headers: Record<string, string> = {}) =>
  POST(new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
const staffHeaders = (role: 'moderator' | 'support') => ({
  cookie: `${ADMIN_SESSION_COOKIE}=${createStaffSessionToken(role)}`,
});
const get = (headers: Record<string, string> = {}) => GET(new Request(URL_, { headers }));
const patch = (body: unknown, headers: Record<string, string> = {}) =>
  PATCH(new Request(URL_, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));

const validBody = {
  kind: 'missing-match',
  title: 'Raja vs Wydad derby missing',
  detail: 'Tonight’s Casablanca derby does not appear in today’s fixtures.',
  website: '',
};

beforeEach(() => {
  __resetStore();
  resetSubmissionMemory();
});

describe('POST /api/community/submissions', () => {
  it('rejects malformed JSON and invalid fields with 400 + field identity', async () => {
    const malformed = await post('not-json{');
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toBe('Invalid request body.');

    const badKind = await post({ ...validBody, kind: 'score-fix' });
    expect(badKind.status).toBe(400);
    expect((await badKind.json()).field).toBe('kind');

    const shortTitle = await post({ ...validBody, title: 'Hi' });
    expect(shortTitle.status).toBe(400);
    expect((await shortTitle.json()).field).toBe('title');
    expect(await listSubmissions()).toHaveLength(0);
  });

  it('rejects non-public or malformed source URLs', async () => {
    const base = { kind: 'source-suggestion', title: 'Official cup stream', detail: 'The federation lists a free official stream.', website: '' };
    for (const url of ['http://169.254.169.254/latest/meta-data', 'http://127.0.0.1:3000/admin', 'https://user:pass@example.com/x', 'javascript:alert(1)', 'not a url']) {
      const res = await post({ ...base, url });
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('url');
    }
    const missing = await post(base);
    expect(missing.status).toBe(400);
    expect((await missing.json()).field).toBe('url');
    expect(await listSubmissions()).toHaveLength(0);
  });

  it('accepts a valid submission with 201 and files it as pending', async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const { ok, id } = await res.json();
    expect(ok).toBe(true);
    expect(id).toMatch(/^sub_/);
    const queue = await listSubmissions();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id, status: 'pending', kind: 'missing-match', reports: 0 });
  });

  it('honeypot: silently accepts bot posts without storing anything', async () => {
    const res = await post({ ...validBody, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(await listSubmissions()).toHaveLength(0);
  });

  it('rate-limits the 6th write from one IP inside the window', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) {
      expect((await post(validBody, ip)).status).toBe(201);
    }
    const sixth = await post(validBody, ip);
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).reason).toBe('throttled');
    expect(await listSubmissions()).toHaveLength(5); // the throttled write stored nothing
    // A different fan (different IP) is unaffected.
    expect((await post(validBody)).status).toBe(201);
  });

  it('report action flags an entry for moderators; unknown ids 404', async () => {
    const created = await (await post(validBody)).json();
    const report = await post({ action: 'report', id: created.id });
    expect(report.status).toBe(200);
    expect((await listSubmissions())[0].reports).toBe(1);
    const unknown = await post({ action: 'report', id: 'sub_nope' });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).ok).toBe(false);
  });
});

describe('staff queue authorization (streams.manage)', () => {
  it('GET: 401 unauthenticated, 403 for a desk without streams.manage, 200 for moderators', async () => {
    await post(validBody);
    expect((await get()).status).toBe(401);
    const forbidden = await get(staffHeaders('support'));
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).required).toBe('streams.manage');
    const ok = await get(staffHeaders('moderator'));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.submissions).toHaveLength(1);
    expect(body.counts).toMatchObject({ pending: 1, approved: 0, rejected: 0, removed: 0 });
  });

  it('PATCH: 401 unauthenticated, 403 for support, moderators can approve and remove', async () => {
    const { id } = await (await post(validBody)).json();
    expect((await patch({ id, status: 'approved' })).status).toBe(401);
    expect((await patch({ id, status: 'approved' }, staffHeaders('support'))).status).toBe(403);
    // Failed attempts changed nothing.
    expect((await listSubmissions())[0].status).toBe('pending');

    const approved = await patch({ id, status: 'approved' }, staffHeaders('moderator'));
    expect(approved.status).toBe(200);
    expect((await approved.json()).submission.status).toBe('approved');

    const removed = await patch({ id, status: 'removed' }, staffHeaders('moderator'));
    expect(removed.status).toBe(200);
    expect((await listSubmissions())[0].status).toBe('removed');
    // Removed entries can no longer be reported.
    expect((await post({ action: 'report', id })).status).toBe(404);
  });

  it('PATCH rejects unknown ids and non-lifecycle statuses', async () => {
    const headers = staffHeaders('moderator');
    expect((await patch({ id: 'sub_nope', status: 'approved' }, headers)).status).toBe(404);
    const { id } = await (await post(validBody)).json();
    const promoted = await patch({ id, status: 'promoted-to-verified' }, headers);
    expect(promoted.status).toBe(404);
    expect((await listSubmissions())[0].status).toBe('pending');
  });
});

describe('isolation from verified match data', () => {
  it('submitting and approving only ever writes the submissions store', async () => {
    const { id } = await (await post({ ...validBody, matchId: 'espn-999999' })).json();
    expect((await patch({ id, status: 'approved' }, staffHeaders('moderator'))).status).toBe(200);
    // The entire flow touched exactly one cache key — its own. No match,
    // scoreboard, or catalogue keys were created or modified, and approval
    // is only a status inside the moderation queue (no "verified" promotion
    // status exists in the lifecycle).
    expect([...cacheStore().keys()]).toEqual(['community_submissions_v1']);
    const [item] = await listSubmissions();
    expect(item).toMatchObject({ id, status: 'approved', matchId: 'espn-999999' });
    expect(Object.keys(item)).not.toContain('homeScore');
    expect(Object.keys(item)).not.toContain('verified');
  });
});
