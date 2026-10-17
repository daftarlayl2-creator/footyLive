import { describe, expect, it } from 'vitest';
import { isVisibleMatch, selectVisibleMatches, STALE_UPCOMING_GRACE_MS } from './visible';
import type { Match } from '../types';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function match(patch: Partial<Match>): Match {
  return {
    id: 'm1',
    title: 'A vs B',
    sport: 'football',
    status: 'upcoming',
    source: 'espn',
    timestamp: NOW + HOUR,
    tournament: 'League',
    country: '',
    priority: 1,
    homeTeam: { name: 'A', badge: '' },
    awayTeam: { name: 'B', badge: '' },
    leagueLogo: '',
    poster: '',
    venue: '',
    note: '',
    sources: [],
    fallbackChannels: [],
    currentMinute: '',
    currentMinuteNumber: 0,
    homeScore: 0,
    awayScore: 0,
    ...patch,
  };
}

describe('isVisibleMatch', () => {
  it('keeps finished results regardless of kick-off age (regression: 36h cutoff)', () => {
    expect(isVisibleMatch(match({ status: 'finished', timestamp: NOW - 40 * HOUR }), NOW)).toBe(true);
    expect(isVisibleMatch(match({ status: 'finished', timestamp: NOW - 47 * HOUR }), NOW)).toBe(true);
  });

  it('keeps a finished result even with an invalid timestamp', () => {
    expect(isVisibleMatch(match({ status: 'finished', timestamp: 0 }), NOW)).toBe(true);
    expect(isVisibleMatch(match({ status: 'finished', timestamp: Number.NaN }), NOW)).toBe(true);
  });

  it('always keeps live matches', () => {
    expect(isVisibleMatch(match({ status: 'live', timestamp: NOW - 2 * HOUR }), NOW)).toBe(true);
    expect(isVisibleMatch(match({ status: 'live', timestamp: 0 }), NOW)).toBe(true);
  });

  it('drops stale upcoming fixtures instead of showing them as live', () => {
    expect(isVisibleMatch(match({ status: 'upcoming', timestamp: NOW - STALE_UPCOMING_GRACE_MS - 1 }), NOW)).toBe(false);
    expect(isVisibleMatch(match({ status: 'upcoming', timestamp: NOW - STALE_UPCOMING_GRACE_MS }), NOW)).toBe(true);
    expect(isVisibleMatch(match({ status: 'upcoming', timestamp: NOW + HOUR }), NOW)).toBe(true);
  });

  it('drops upcoming fixtures without a valid kick-off time', () => {
    expect(isVisibleMatch(match({ status: 'upcoming', timestamp: 0 }), NOW)).toBe(false);
    expect(isVisibleMatch(match({ status: 'upcoming', timestamp: Number.NaN }), NOW)).toBe(false);
  });
});

describe('selectVisibleMatches', () => {
  it('orders live, then upcoming by kick-off, then finished newest first', () => {
    const matches = [
      match({ id: 'f-old', status: 'finished', timestamp: NOW - 30 * HOUR }),
      match({ id: 'u-late', status: 'upcoming', timestamp: NOW + 5 * HOUR }),
      match({ id: 'live', status: 'live', timestamp: NOW - HOUR }),
      match({ id: 'f-new', status: 'finished', timestamp: NOW - 3 * HOUR }),
      match({ id: 'u-soon', status: 'upcoming', timestamp: NOW + HOUR }),
      match({ id: 'u-stale', status: 'upcoming', timestamp: NOW - 2 * HOUR }),
    ];
    expect(selectVisibleMatches(matches, NOW).map((m) => m.id)).toEqual([
      'live',
      'u-soon',
      'u-late',
      'f-new',
      'f-old',
    ]);
  });
});
