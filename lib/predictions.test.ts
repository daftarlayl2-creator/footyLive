import { describe, expect, it } from 'vitest';
import { parseStoredVote, tallyVotes, toPercentages, voteStorageKey } from './predictions';
import {
  MAX_MESSAGE_LENGTH,
  generateFanName,
  hueFor,
  initialsFor,
  mergeMessages,
  normalizeMessageText,
  sanitizeNickname,
  upsertMessage,
  type ChatMessage,
} from './chat';

describe('prediction helpers', () => {
  it('produces whole percentages that always total 100', () => {
    expect(toPercentages({ home: 1, draw: 1, away: 1 })).toEqual({ home: 34, draw: 33, away: 33 });
    expect(toPercentages({ home: 2, draw: 0, away: 1 })).toEqual({ home: 67, draw: 0, away: 33 });
    expect(toPercentages({ home: 0, draw: 0, away: 0 })).toEqual({ home: 0, draw: 0, away: 0 });
    for (const counts of [
      { home: 7, draw: 3, away: 11 },
      { home: 1, draw: 2, away: 3 },
      { home: 999, draw: 1, away: 1 },
    ]) {
      const pct = toPercentages(counts);
      expect(pct.home + pct.draw + pct.away).toBe(100);
    }
  });

  it('counts one vote per voter and always includes this device’s own vote', () => {
    const rows = new Map([
      ['a', 'home'],
      ['b', 'away'],
      ['mine', 'home'],
    ] as const);
    // The device switched its vote to draw before the backend caught up.
    expect(tallyVotes(rows as any, { id: 'mine', prediction: 'draw' })).toEqual({ home: 1, draw: 1, away: 1 });
    // A brand-new vote not yet echoed by the backend still counts immediately.
    expect(tallyVotes(new Map(), { id: 'x', prediction: 'away' })).toEqual({ home: 0, draw: 0, away: 1 });
  });

  it('parses stored votes defensively', () => {
    expect(voteStorageKey('espn-1')).toBe('eviv:vote:espn-1');
    expect(parseStoredVote(JSON.stringify({ id: 'v1', prediction: 'away' }))).toEqual({ id: 'v1', prediction: 'away' });
    expect(parseStoredVote('{"id":"v1","prediction":"banana"}')).toBeNull();
    expect(parseStoredVote('not json')).toBeNull();
    expect(parseStoredVote(null)).toBeNull();
  });
});

const msg = (id: string, created_at: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  match_id: 'm1',
  username: 'Fan1234',
  message: `message ${id}`,
  created_at,
  ...extra,
});

describe('chat helpers', () => {
  it('keeps messages ordered, de-duplicated and capped', () => {
    let list: ChatMessage[] = [];
    list = upsertMessage(list, msg('b', '2026-10-15T10:00:02Z'));
    list = upsertMessage(list, msg('a', '2026-10-15T10:00:01Z'));
    list = upsertMessage(list, msg('b', '2026-10-15T10:00:02Z', { _status: 'sent' }));
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
    expect(list[1]._status).toBe('sent');

    const capped = upsertMessage(list, msg('c', '2026-10-15T10:00:03Z'), 2);
    expect(capped.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('never downgrades a confirmed message back to sending', () => {
    const confirmed = [msg('a', '2026-10-15T10:00:01Z', { _status: 'sent' })];
    const next = upsertMessage(confirmed, msg('a', '2026-10-15T10:00:01Z', { _status: 'sending' }));
    expect(next[0]._status).toBe('sent');
  });

  it('merges loaded history with optimistic messages still in flight', () => {
    const history = [msg('a', '2026-10-15T10:00:01Z')];
    const current = [msg('z', '2026-10-15T10:00:09Z', { _status: 'sending' })];
    const merged = mergeMessages(history, current);
    expect(merged.map((m) => [m.id, m._status])).toEqual([
      ['a', 'sent'],
      ['z', 'sending'],
    ]);
  });

  it('normalises message text and nicknames', () => {
    expect(normalizeMessageText('  what   a\n goal  ')).toBe('what a goal');
    expect(normalizeMessageText('x'.repeat(400))).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(sanitizeNickname('  <b>Ultra</b>   Fan  ')).toBe('bUltra/b Fan');
    expect(sanitizeNickname('a'.repeat(40))).toHaveLength(20);
    expect(generateFanName(() => 0)).toBe('Fan1000');
    expect(generateFanName(() => 0.99999)).toBe('Fan9999');
  });

  it('derives stable avatar initials and colours', () => {
    expect(initialsFor('Fan1234')).toBe('FA');
    expect(initialsFor('Achraf Hakimi')).toBe('AH');
    expect(hueFor('Fan1234')).toBe(hueFor('Fan1234'));
    expect(hueFor('Fan1234')).toBeGreaterThanOrEqual(0);
    expect(hueFor('Fan1234')).toBeLessThan(360);
  });
});
