/** Isomorphic health/ranking rules shared by the engine, player and quad view. */
export type StreamHealthStatus = 'live' | 'offline' | 'checking' | 'unknown';
export interface StreamHealth {
  status: StreamHealthStatus;
  /** Measured startup probe latency from the application server, not viewer RTT. */
  latencyMs: number | null;
  checkedAt: number;
  /** Fraction of successful probes in the most recent (up to five) samples. */
  successRate: number;
  samples: number;
  /** Strong probe: an HLS media segment (or direct media sample) was reachable. */
  mediaVerified?: boolean;
}

export const HEALTH_REFRESH_MS = 30_000;
export const HEALTH_STALE_MS = 90_000;
export const MAX_HEALTH_BATCH = 12;

export function unknownHealth(status: StreamHealthStatus = 'unknown'): StreamHealth {
  return { status, latencyMs: null, checkedAt: 0, successRate: 0, samples: 0 };
}

export function isStreamHealth(value: unknown): value is StreamHealth {
  if (!value || typeof value !== 'object') return false;
  const v = value as StreamHealth;
  return ['live', 'offline', 'checking', 'unknown'].includes(v.status) &&
    (v.latencyMs === null || (Number.isFinite(v.latencyMs) && v.latencyMs >= 0)) &&
    Number.isFinite(v.checkedAt) && v.checkedAt >= 0 && Number.isFinite(v.successRate) && v.successRate >= 0 && v.successRate <= 1 &&
    Number.isInteger(v.samples) && v.samples >= 0 && (v.mediaVerified === undefined || typeof v.mediaVerified === 'boolean');
}

export function freshHealth(health: StreamHealth | undefined, now = Date.now()): StreamHealth | undefined {
  return health && health.checkedAt > 0 && health.checkedAt <= now + 5_000 && now - health.checkedAt <= HEALTH_STALE_MS ? health : undefined;
}

interface Rankable {
  health?: StreamHealth;
  quality?: string;
  provider?: string;
  coverage?: 'fixture' | 'broadcaster' | 'sports';
}

function qualityBonus(quality?: string): number {
  if (/^(fhd|uhd|4k|1080[pi]|1440p|2160p)$/i.test(quality || '')) return 180;
  if (/^(hd|720p)$/i.test(quality || '')) return 100;
  return 0;
}
const tier = (health?: StreamHealth) => health?.status === 'live' ? 0 : health?.status === 'offline' ? 2 : 1;

/** Reliability and speed dominate resolution: a slow FHD must not beat a fast HD. */
export function compareStreamHealth(a: Rankable, b: Rankable): number {
  // Unverified fixture fallbacks are never promoted over match-specific sources.
  const offline = Number(a.health?.status === 'offline') - Number(b.health?.status === 'offline');
  if (offline) return offline;
  const unverified = Number(a.provider?.includes('fallback') || false) - Number(b.provider?.includes('fallback') || false);
  if (unverified) return unverified;
  const status = tier(a.health) - tier(b.health);
  if (status) return status;
  // Among working backups a broadcaster hint beats an unrelated sports feed.
  const coverage = Number(a.coverage === 'sports') - Number(b.coverage === 'sports');
  if (coverage) return coverage;
  const score = (entry: Rankable) => (entry.health?.samples ? (1 - entry.health.successRate) * 2500 : 0) +
    (entry.health?.latencyMs ?? 1500) - qualityBonus(entry.quality);
  return score(a) - score(b);
}

/** Stable sort keeps provider order when health and quality are indistinguishable. */
export function rankStreams<T extends Rankable>(streams: T[]): T[] {
  return streams.map((stream, index) => ({ stream, index }))
    .sort((a, b) => compareStreamHealth(a.stream, b.stream) || a.index - b.index).map(({ stream }) => stream);
}
