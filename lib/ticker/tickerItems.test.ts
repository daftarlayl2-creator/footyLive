import { describe, expect, it } from 'vitest';
import { buildTickerItems } from './tickerItems';

const NOW = new Date('2026-10-17T15:00:00').getTime();
const base = (overrides: Record<string, unknown>) => ({
  id: 'm1', tournament: 'Premier League', timestamp: NOW,
  homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' }, sources: [], fallbackChannels: [], priority: 1,
  ...overrides,
}) as never;

describe('buildTickerItems (Phase 5)', () => {
  it('renders live, finished<24h, and todays upcoming in that order', () => {
    const items = buildTickerItems([
      base({ id: 'up', status: 'upcoming', timestamp: NOW + 3 * 3600e3 }),
      base({ id: 'ft', status: 'finished', timestamp: NOW - 2 * 3600e3, homeScore: 2, awayScore: 1 }),
      base({ id: 'lv', status: 'live', currentMinute: '67', homeScore: 1, awayScore: 0 }),
    ], NOW);
    expect(items.map((i) => i.kind)).toEqual(['live', 'finished', 'upcoming']);
    expect(items[0].label).toContain('67′ Arsenal 1–0 Chelsea');
    expect(items[1].label).toContain('FT Arsenal 2–1 Chelsea');
    expect(items[2].label).toContain('Arsenal vs Chelsea');
  });

  it('drops stale finals, scoreless rows, and non-today fixtures — nothing is invented', () => {
    const items = buildTickerItems([
      base({ id: 'old', status: 'finished', timestamp: NOW - 48 * 3600e3, homeScore: 1, awayScore: 1 }),
      base({ id: 'colon', status: 'finished', timestamp: NOW - 3600e3, homeScore: '1:0', awayScore: '0' }),
      base({ id: 'tomorrow', status: 'upcoming', timestamp: NOW + 25 * 3600e3 }),
      base({ id: 'past', status: 'upcoming', timestamp: NOW - 3600e3 }),
      base({ id: 'live-no-score', status: 'live' }),
    ], NOW);
    expect(items).toEqual([]);
  });

  it('dedupes repeated match ids and caps the strip', () => {
    const many = Array.from({ length: 25 }, (_, i) => base({ id: `m${i}`, status: 'finished', timestamp: NOW - 3600e3, homeScore: 1, awayScore: 0 }));
    const dup = base({ id: 'm0', status: 'finished', timestamp: NOW - 3600e3, homeScore: 5, awayScore: 5 });
    const items = buildTickerItems([...many, dup], NOW);
    expect(items).toHaveLength(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('handles empty / malformed input', () => {
    expect(buildTickerItems([], NOW)).toEqual([]);
    expect(buildTickerItems(undefined as never, NOW)).toEqual([]);
  });
});
