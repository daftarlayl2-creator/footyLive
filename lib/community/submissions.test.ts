import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  const store = new Map<string, unknown>();
  return {
    getCacheManager: () => ({
      async get(key: string) { return store.get(key) ?? null; },
      async set(key: string, value: unknown) { store.set(key, value); },
    }),
    __resetStore: () => store.clear(),
  };
});

import * as cacheManagerMock from '@/lib/cache/cacheManager';
import { isValidSubmissionUrl, listSubmissions, moderateSubmission, reportSubmission, resetSubmissionMemory, submitCommunityItem } from './submissions';

const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;

describe('community submissions (Phase 12)', () => {
  beforeEach(() => { __resetStore(); resetSubmissionMemory(); });

  it('validates URLs: public http(s) only, no credentials or private hosts', () => {
    expect(isValidSubmissionUrl('https://www.example.com/stream')).toBe(true);
    expect(isValidSubmissionUrl('javascript:alert(1)')).toBe(false);
    expect(isValidSubmissionUrl('https://user:pass@example.com/x')).toBe(false);
    expect(isValidSubmissionUrl('http://127.0.0.1:3000/admin')).toBe(false);
    expect(isValidSubmissionUrl('http://192.168.1.1/x')).toBe(false);
    expect(isValidSubmissionUrl('not a url')).toBe(false);
    expect(isValidSubmissionUrl('https://localhost/x')).toBe(false);
  });

  it('files a valid submission as pending and strips markup', async () => {
    const result = await submitCommunityItem({
      kind: 'missing-match',
      title: '<b>Raja vs Wydad</b> derby missing',
      detail: 'Tonight’s Casablanca derby does not appear in today’s fixtures.',
      reporter: 'AtlasFan',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.status).toBe('pending');
      expect(result.submission.title).not.toContain('<');
      expect(result.submission.reports).toBe(0);
    }
    expect(await listSubmissions()).toHaveLength(1);
  });

  it('rejects invalid kinds, short fields, and bad links', async () => {
    expect((await submitCommunityItem({ kind: 'score-fix', title: 'Change score', detail: 'Make it 3-0 please now' })).ok).toBe(false);
    expect((await submitCommunityItem({ kind: 'missing-match', title: 'Hi', detail: 'some longer detail here' })).ok).toBe(false);
    expect((await submitCommunityItem({ kind: 'source-suggestion', title: 'A source', detail: 'details details details' })).ok).toBe(false);
    expect((await submitCommunityItem({ kind: 'source-suggestion', title: 'A source', detail: 'details details details', url: 'http://169.254.169.254/meta' })).ok).toBe(false);
    expect(await listSubmissions()).toHaveLength(0);
  });

  it('supports moderation and flagging without ever exposing removed items to reports', async () => {
    const result = await submitCommunityItem({ kind: 'missing-match', title: 'Missing cup tie', detail: 'The cup quarter-final is not listed.' });
    if (!result.ok) throw new Error('setup failed');
    const { id } = result.submission;
    expect(await reportSubmission(id)).toBe(true);
    expect((await listSubmissions())[0].reports).toBe(1);
    const approved = await moderateSubmission(id, 'approved');
    expect(approved.ok && approved.submission?.status).toBe('approved');
    expect(await listSubmissions('pending')).toHaveLength(0);
    await moderateSubmission(id, 'removed');
    expect(await reportSubmission(id)).toBe(false);
    expect((await moderateSubmission(id, 'promoted-to-verified')).ok).toBe(false);
  });
});
