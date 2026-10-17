import { describe, expect, it, vi } from 'vitest';

/** In-memory stand-in for the Upstash client used by RedisCacheManager. */
const store = new Map<string, string>();

vi.mock('@upstash/redis', () => ({
  Redis: class FakeRedis {
    async get(key: string) {
      return store.has(key) ? store.get(key) : null;
    }
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    }
  },
}));

import { RedisCacheManager } from './cacheManager';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('RedisCacheManager.swr request deduplication', () => {
  it('shares one upstream fetch between concurrent cache misses', async () => {
    store.clear();
    const cache = new RedisCacheManager('https://fake.upstash.io', 'token');
    const fetcher = vi.fn(async () => ({ fresh: true }));

    const results = await Promise.all([
      cache.swr('miss-key', fetcher, 20),
      cache.swr('miss-key', fetcher, 20),
      cache.swr('miss-key', fetcher, 20),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ fresh: true }, { fresh: true }, { fresh: true }]);
  });

  it('revalidates in the background at most once per TTL window on hits', async () => {
    store.clear();
    store.set('hit-key', JSON.stringify({ cached: 1 }));
    const cache = new RedisCacheManager('https://fake.upstash.io', 'token');
    const fetcher = vi.fn(async () => ({ cached: 2 }));

    // Many concurrent readers: all get the cached value, one refresh runs.
    const values = await Promise.all([
      cache.swr('hit-key', fetcher, 20),
      cache.swr('hit-key', fetcher, 20),
      cache.swr('hit-key', fetcher, 20),
    ]);
    expect(values).toEqual([{ cached: 1 }, { cached: 1 }, { cached: 1 }]);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get('hit-key')!)).toEqual({ cached: 2 });

    // Further hits inside the TTL window do not fetch again.
    await cache.swr('hit-key', fetcher, 20);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('revalidates again once the TTL window has elapsed', async () => {
    store.clear();
    store.set('hit-key', JSON.stringify({ cached: 1 }));
    const cache = new RedisCacheManager('https://fake.upstash.io', 'token');
    const fetcher = vi.fn(async () => ({ cached: 2 }));
    const nowSpy = vi.spyOn(Date, 'now');
    try {
      const t0 = Date.now();
      nowSpy.mockReturnValue(t0);
      await cache.swr('hit-key', fetcher, 20);
      await flush();
      expect(fetcher).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(t0 + 21_000);
      await cache.swr('hit-key', fetcher, 20);
      await flush();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('a failed background refresh keeps serving the cached value', async () => {
    store.clear();
    store.set('hit-key', JSON.stringify({ cached: 1 }));
    const cache = new RedisCacheManager('https://fake.upstash.io', 'token');
    const failing = vi.fn(async () => {
      throw new Error('upstream down');
    });

    await expect(cache.swr('hit-key', failing, 20)).resolves.toEqual({ cached: 1 });
    await flush();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get('hit-key')!)).toEqual({ cached: 1 });
  });
});
