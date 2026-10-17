import { Redis } from '@upstash/redis';
import logger from '../logger';

export interface CacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  swr<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T>;
}

class InMemoryCacheManager implements CacheManager {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private inflight = new Map<string, Promise<any>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async swr<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now < cached.expiresAt) {
      return cached.value as T;
    }

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = fetcher().then(data => {
        this.set(key, data, ttlSeconds);
        this.inflight.delete(key);
        return data;
      }).catch(err => {
        this.inflight.delete(key);
        throw err;
      });
      this.inflight.set(key, promise);
    }

    if (cached) {
      promise.catch(err => logger.error(`SWR background refresh failed for memory key: ${key}`, err));
      return cached.value as T;
    }

    return promise;
  }
}

export class RedisCacheManager implements CacheManager {
  private redis: Redis;
  private memoryFallback = new InMemoryCacheManager();
  /** One upstream refresh per key at a time, shared by every caller. */
  private inflight = new Map<string, Promise<any>>();
  /** Last successful revalidation per key (this instance). */
  private lastRevalidatedAt = new Map<string, number>();

  constructor(url: string, token: string) {
    this.redis = new Redis({
      url,
      token,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (data === null || data === undefined) return null;
      return (typeof data === 'string' ? JSON.parse(data) : data) as T;
    } catch (err) {
      logger.error(`Redis get failed for key: ${key}, falling back to memory`, err);
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (err) {
      logger.error(`Redis set failed for key: ${key}, falling back to memory`, err);
      await this.memoryFallback.set(key, value, ttlSeconds);
    }
  }

  /** Deduplicated refresh: concurrent callers share one upstream fetch. */
  private refresh<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = fetcher()
      .then(async (data) => {
        this.lastRevalidatedAt.set(key, Date.now());
        await this.set(key, data, ttlSeconds);
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  async swr<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        // Serve the cached value and revalidate in the background at most
        // once per TTL window (per instance). Previously every hit fired
        // its own upstream fetch, so N concurrent readers caused N fetches
        // whose write-backs raced — the slowest (stalest) could win.
        const last = this.lastRevalidatedAt.get(key) ?? 0;
        if (Date.now() - last >= ttlSeconds * 1000) {
          this.refresh(key, fetcher, ttlSeconds).catch((err) =>
            logger.error(`SWR background refresh failed for Redis key: ${key}`, err)
          );
        }
        return cached;
      }
    } catch (err) {
      logger.error(`Redis SWR failed for key: ${key}, calling fetcher directly`, err);
    }

    // Hard cache miss or Redis error: wait for the single shared fetch.
    return this.refresh(key, fetcher, ttlSeconds);
  }
}

let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (cacheManagerInstance) return cacheManagerInstance;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

  if (redisUrl && redisToken) {
    logger.info('Initializing Redis Cache Manager');
    cacheManagerInstance = new RedisCacheManager(redisUrl, redisToken);
  } else {
    logger.info('Initializing InMemory Cache Manager (No Redis credentials configured)');
    cacheManagerInstance = new InMemoryCacheManager();
  }

  return cacheManagerInstance;
}
