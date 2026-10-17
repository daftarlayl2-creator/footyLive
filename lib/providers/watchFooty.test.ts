import { describe, expect, it } from 'vitest';
import { normalizeWatchFootyMatch, parseWatchFootyTimestamp } from './watchFooty';

const KICKOFF_MS = Date.parse('2026-10-14T19:00:00Z');

function raw(patch: Record<string, any> = {}): any {
  return {
    matchId: 'wf-42',
    title: 'Arsenal vs Liverpool',
    league: 'Premier League',
    status: 'pre',
    timestamp: KICKOFF_MS,
    teams: { home: { name: 'Arsenal', logoUrl: 'a.png' }, away: { name: 'Liverpool', logoUrl: 'b.png' } },
    scores: { home: 0, away: 0 },
    streams: [],
    ...patch,
  };
}

describe('parseWatchFootyTimestamp (explicit units)', () => {
  it('treats epoch seconds as seconds', () => {
    expect(parseWatchFootyTimestamp(KICKOFF_MS / 1000)).toBe(KICKOFF_MS);
    expect(parseWatchFootyTimestamp(String(KICKOFF_MS / 1000))).toBe(KICKOFF_MS);
  });

  it('treats epoch milliseconds as milliseconds', () => {
    expect(parseWatchFootyTimestamp(KICKOFF_MS)).toBe(KICKOFF_MS);
    expect(parseWatchFootyTimestamp(String(KICKOFF_MS))).toBe(KICKOFF_MS);
  });

  it('parses ISO strings', () => {
    expect(parseWatchFootyTimestamp('2026-10-14T19:00:00Z')).toBe(KICKOFF_MS);
  });

  it('rejects missing, invalid and implausible values instead of inventing a time', () => {
    expect(parseWatchFootyTimestamp(undefined)).toBe(0);
    expect(parseWatchFootyTimestamp(null)).toBe(0);
    expect(parseWatchFootyTimestamp('')).toBe(0);
    expect(parseWatchFootyTimestamp('not a date')).toBe(0);
    expect(parseWatchFootyTimestamp(0)).toBe(0);
    expect(parseWatchFootyTimestamp(-5)).toBe(0);
    expect(parseWatchFootyTimestamp(Number.NaN)).toBe(0);
    // 1970 in ms and year-5138 territory are unit mix-ups, not fixtures.
    expect(parseWatchFootyTimestamp(1_000)).toBe(0);
  });
});

describe('normalizeWatchFootyMatch status mapping (authoritative only)', () => {
  it('maps post/finished/FT to finished with the structured score', () => {
    for (const status of ['post', 'finished', 'FT', 'full-time', 'completed']) {
      const m = normalizeWatchFootyMatch(raw({ status, scores: { home: 2, away: 1 } }));
      expect(m.status).toBe('finished');
      expect(m.currentMinute).toBe('FT');
      expect(m.homeScore).toBe(2);
      expect(m.awayScore).toBe(1);
    }
  });

  it('maps in/live to live and passes the upstream minute through untouched', () => {
    const m = normalizeWatchFootyMatch(raw({ status: 'in', currentMinute: "63'", currentMinuteNumber: 63, scores: { home: 1, away: 0 } }));
    expect(m.status).toBe('live');
    expect(m.currentMinute).toBe("63'");
    expect(m.currentMinuteNumber).toBe(63);
  });

  it('never infers live from a past kick-off, scores or a structured minute', () => {
    // Kick-off long past + structured minute + non-zero scores, but the
    // provider still says "pre": must stay upcoming, with no invented clock.
    const m = normalizeWatchFootyMatch(raw({
      status: 'pre',
      timestamp: Date.now() - 60 * 60 * 1000,
      currentMinuteNumber: 55,
      scores: { home: 1, away: 1 },
    }));
    expect(m.status).toBe('upcoming');
    expect(m.currentMinute).toBe('');
  });

  it('does not fabricate a minute for a live match missing one', () => {
    const m = normalizeWatchFootyMatch(raw({ status: 'live', timestamp: Date.now() - 30 * 60 * 1000 }));
    expect(m.status).toBe('live');
    expect(m.currentMinute).toBe('');
    expect(m.currentMinuteNumber).toBe(0);
  });

  it('keeps postponed/cancelled fixtures upcoming with an honest note', () => {
    expect(normalizeWatchFootyMatch(raw({ status: 'postponed' })).status).toBe('upcoming');
    expect(normalizeWatchFootyMatch(raw({ status: 'postponed' })).note).toBe('Postponed');
    expect(normalizeWatchFootyMatch(raw({ status: 'cancelled' })).note).toBe('Cancelled');
    // An upstream note wins over the status-derived one.
    expect(normalizeWatchFootyMatch(raw({ status: 'postponed', note: 'Waterlogged pitch' })).note).toBe('Waterlogged pitch');
  });

  it('defaults unknown or missing statuses to upcoming', () => {
    expect(normalizeWatchFootyMatch(raw({ status: 'scheduled' })).status).toBe('upcoming');
    expect(normalizeWatchFootyMatch(raw({ status: undefined })).status).toBe('upcoming');
  });

  it('tags the source and normalises seconds-based kick-offs to ms', () => {
    const m = normalizeWatchFootyMatch(raw({ timestamp: KICKOFF_MS / 1000 }));
    expect(m.source).toBe('watchfooty');
    expect(m.timestamp).toBe(KICKOFF_MS);
  });

  it('uses 0 (not "now") when the kick-off time is invalid', () => {
    const before = Date.now();
    const m = normalizeWatchFootyMatch(raw({ timestamp: 'garbage' }));
    expect(m.timestamp).toBe(0);
    expect(m.timestamp).toBeLessThan(before);
  });

  it('reads scores only from structured fields', () => {
    const m = normalizeWatchFootyMatch(raw({ status: 'post', title: 'Arsenal 18:00 Liverpool', scores: { home: '3', away: 2 } }));
    expect(m.homeScore).toBe(3);
    expect(m.awayScore).toBe(2);
    const none = normalizeWatchFootyMatch(raw({ status: 'post', title: 'Arsenal 4-2 Liverpool', scores: undefined, homeScore: undefined, awayScore: undefined }));
    expect(none.homeScore).toBe(0);
    expect(none.awayScore).toBe(0);
  });
});
