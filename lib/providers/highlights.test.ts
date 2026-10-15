/**
 * Highlights provider tests: the ScoreBat request must carry browser headers
 * and a hard 3-second deadline, and every failure mode must degrade to an
 * empty list instead of hanging or throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async () => null,
    set: async () => {},
    // The provider's resilience is under test here, not the cache internals.
    swr: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  }),
}));

import { getHighlights, SCOREBAT_TIMEOUT_MS, withTimeout } from './highlights';

const SCOREBAT_PAYLOAD = {
  response: [
    {
      id: 'm1',
      title: 'Arsenal vs Liverpool',
      competition: { name: 'Premier League' },
      date: '2026-10-15T20:00:00+00:00',
      thumbnail: 'https://img.example.com/t.jpg',
      videos: [{ id: 'v1', title: 'Highlights', embed: '<iframe src="https://v.example.com/1"></iframe>', url: 'https://v.example.com/1' }],
    },
  ],
};

describe('getHighlights', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('requests ScoreBat with a Mozilla/5.0 UA, JSON accept header and an abort signal', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(SCOREBAT_PAYLOAD), { status: 200 });
      })
    );

    const list = await getHighlights();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'm1',
      title: 'Arsenal vs Liverpool',
      competition: 'Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Liverpool',
      thumbnail: 'https://img.example.com/t.jpg',
    });
    expect(list[0].embed).toContain('<iframe');

    expect(calls).toHaveLength(1);
    expect(String(calls[0].url)).toContain('scorebat.com/video-api/v3');
    expect(calls[0].init.headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
    expect(calls[0].init.headers['Accept']).toBe('application/json');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('degrades to an empty list on upstream HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(getHighlights()).resolves.toEqual([]);
  });

  it('splits team names on whole words only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            response: [
              { id: 'a', title: 'Paris Saint-Germain vs Marseille', videos: [] },
              { id: 'b', title: 'Real Madrid - Barcelona', videos: [] },
              { id: 'c', title: 'Single Name', videos: [] },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const list = await getHighlights();
    expect(list[0]).toMatchObject({ homeTeam: 'Paris Saint-Germain', awayTeam: 'Marseille' });
    expect(list[1]).toMatchObject({ homeTeam: 'Real Madrid', awayTeam: 'Barcelona' });
    expect(list[2]).toMatchObject({ homeTeam: 'Single Name', awayTeam: '' });
  });

  it('degrades to an empty list on network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(getHighlights()).resolves.toEqual([]);
  });

  it('gives up after the 3-second deadline even when the upstream hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never settles

    const pending = getHighlights();
    await vi.advanceTimersByTimeAsync(SCOREBAT_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([]);
    vi.useRealTimers();
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useRealTimers());

  it('passes through fast results', async () => {
    await expect(withTimeout(Promise.resolve([1]), 1000, [])).resolves.toEqual([1]);
  });

  it('falls back on timeout and on rejection', async () => {
    vi.useFakeTimers();
    const hanging = withTimeout(new Promise<number[]>(() => {}), 500, [7]);
    await vi.advanceTimersByTimeAsync(500);
    await expect(hanging).resolves.toEqual([7]);
    vi.useRealTimers();

    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, [9])).resolves.toEqual([9]);
  });
});
