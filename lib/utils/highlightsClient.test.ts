/**
 * Client highlights fetch tests: the UI helper must ALWAYS resolve within the
 * 3-second window — with data when available, with [] on timeout or error —
 * so no page can stay stuck on "Loading highlights…".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchHighlightsSafely, HIGHLIGHTS_FETCH_TIMEOUT_MS } from './highlightsClient';

const abortedFetch = () =>
  vi.fn(
    (_url: string, init: any) =>
      new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      })
  );

describe('fetchHighlightsSafely', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the fetched highlights on success', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({ highlights: [{ id: '1', title: 'A vs B' }] }),
    }));
    await expect(fetchHighlightsSafely(fetchImpl as any)).resolves.toEqual([{ id: '1', title: 'A vs B' }]);
  });

  it('returns [] on network errors and bad payloads', async () => {
    const failing = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(fetchHighlightsSafely(failing as any)).resolves.toEqual([]);

    const badPayload = vi.fn(async () => ({ json: async () => ({ nope: true }) }));
    await expect(fetchHighlightsSafely(badPayload as any)).resolves.toEqual([]);

    const badJson = vi.fn(async () => ({ json: async () => { throw new SyntaxError('bad json'); } }));
    await expect(fetchHighlightsSafely(badJson as any)).resolves.toEqual([]);
  });

  it('aborts and returns [] when the API hangs past the 3-second deadline', async () => {
    vi.useFakeTimers();
    const pending = fetchHighlightsSafely(abortedFetch() as any);
    await vi.advanceTimersByTimeAsync(HIGHLIGHTS_FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([]);
  });
});
