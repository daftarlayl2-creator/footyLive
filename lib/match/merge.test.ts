import { describe, expect, it } from 'vitest';
import { dedupeMatches, fresherMatch, sourceAuthorityRank, statusStageRank } from './merge';
import type { Match } from '../types';

function match(patch: Partial<Match>): Match {
  return {
    id: 'espn-1',
    title: 'A vs B',
    sport: 'football',
    status: 'upcoming',
    source: 'espn',
    timestamp: Date.parse('2026-10-14T19:00Z'),
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

describe('ranks', () => {
  it('orders sources and lifecycle stages', () => {
    expect(sourceAuthorityRank('espn')).toBeGreaterThan(sourceAuthorityRank('watchfooty'));
    expect(sourceAuthorityRank('watchfooty')).toBeGreaterThan(sourceAuthorityRank('unknown'));
    expect(sourceAuthorityRank(undefined)).toBe(sourceAuthorityRank('unknown'));
    expect(statusStageRank('finished')).toBeGreaterThan(statusStageRank('live'));
    expect(statusStageRank('live')).toBeGreaterThan(statusStageRank('upcoming'));
  });
});

describe('fresherMatch conflict resolution', () => {
  it('never lets a stale scheduled copy overwrite a finished result (either order)', () => {
    const finished = match({ status: 'finished', homeScore: 2, awayScore: 1, currentMinute: 'FT' });
    const staleScheduled = match({ status: 'upcoming' });
    expect(fresherMatch(finished, staleScheduled)).toBe(finished);
    expect(fresherMatch(staleScheduled, finished)).toBe(finished);
  });

  it('never lets a stale live copy overwrite a finished result (either order)', () => {
    const finished = match({ status: 'finished', homeScore: 2, awayScore: 1, currentMinute: 'FT' });
    const staleLive = match({ status: 'live', homeScore: 2, awayScore: 1, currentMinuteNumber: 88 });
    expect(fresherMatch(finished, staleLive)).toBe(finished);
    expect(fresherMatch(staleLive, finished)).toBe(finished);
  });

  it('lets a live record replace an upcoming one, never the reverse', () => {
    const live = match({ status: 'live', currentMinuteNumber: 12 });
    const upcoming = match({ status: 'upcoming' });
    expect(fresherMatch(upcoming, live)).toBe(live);
    expect(fresherMatch(live, upcoming)).toBe(live);
  });

  it('keeps the higher-authority source regardless of stage', () => {
    const espnLive = match({ source: 'espn', status: 'live', currentMinuteNumber: 70 });
    const catalogueFinished = match({ source: 'watchfooty', status: 'finished', homeScore: 1 });
    expect(fresherMatch(catalogueFinished, espnLive)).toBe(espnLive);
    expect(fresherMatch(espnLive, catalogueFinished)).toBe(espnLive);

    const espnFinished = match({ source: 'espn', status: 'finished', homeScore: 1 });
    const catalogueLive = match({ source: 'watchfooty', status: 'live', currentMinuteNumber: 70 });
    expect(fresherMatch(catalogueLive, espnFinished)).toBe(espnFinished);
    expect(fresherMatch(espnFinished, catalogueLive)).toBe(espnFinished);
  });

  it('between two live records prefers the higher minute, then more goals', () => {
    const early = match({ status: 'live', currentMinuteNumber: 30, homeScore: 1, awayScore: 1 });
    const later = match({ status: 'live', currentMinuteNumber: 61, homeScore: 1, awayScore: 0 });
    expect(fresherMatch(early, later)).toBe(later);
    expect(fresherMatch(later, early)).toBe(later);

    const moreGoals = match({ status: 'live', currentMinuteNumber: 61, homeScore: 2, awayScore: 0 });
    expect(fresherMatch(later, moreGoals)).toBe(moreGoals);
    expect(fresherMatch(moreGoals, later)).toBe(moreGoals);
  });

  it('between two finished records the incoming (later-fetched) correction wins', () => {
    const first = match({ status: 'finished', homeScore: 2, awayScore: 0 });
    const corrected = match({ status: 'finished', homeScore: 1, awayScore: 0 });
    expect(fresherMatch(first, corrected)).toBe(corrected);
  });

  it('ignores records of a different fixture', () => {
    const current = match({ id: 'espn-1', status: 'upcoming' });
    const other = match({ id: 'espn-2', status: 'finished', homeScore: 5 });
    expect(fresherMatch(current, other)).toBe(current);
  });
});

describe('dedupeMatches', () => {
  it('keeps the finished copy when day boards disagree, preserving order', () => {
    const yesterday = [
      match({ id: 'espn-1', status: 'upcoming' }),
      match({ id: 'espn-2', status: 'live', currentMinuteNumber: 80, homeScore: 1 }),
    ];
    const today = [
      match({ id: 'espn-1', status: 'finished', homeScore: 3, awayScore: 1, currentMinute: 'FT' }),
      match({ id: 'espn-2', status: 'finished', homeScore: 1, awayScore: 0, currentMinute: 'FT' }),
      match({ id: 'espn-3', status: 'upcoming' }),
    ];
    const merged = dedupeMatches([...yesterday, ...today]);
    expect(merged.map((m) => m.id)).toEqual(['espn-1', 'espn-2', 'espn-3']);
    expect(merged[0].status).toBe('finished');
    expect(merged[0].homeScore).toBe(3);
    expect(merged[1].status).toBe('finished');
  });

  it('is independent of board order for status conflicts', () => {
    const finished = match({ status: 'finished', homeScore: 2 });
    const live = match({ status: 'live', currentMinuteNumber: 89, homeScore: 2 });
    expect(dedupeMatches([finished, live])[0].status).toBe('finished');
    expect(dedupeMatches([live, finished])[0].status).toBe('finished');
  });
});
