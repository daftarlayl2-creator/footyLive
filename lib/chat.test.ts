import { describe, expect, it } from 'vitest';
import { CHAT_ROOM_TTL_MS, chatRoomState, hueFor, normalizeMessageText, sanitizeNickname } from './chat';

const KICKOFF = new Date('2026-10-17T20:00:00Z').getTime();
const H = 3600e3;

describe('chat room lifecycle (Phase 7)', () => {
  it('is open before and during the match regardless of timestamps', () => {
    expect(chatRoomState('upcoming', KICKOFF, KICKOFF - H)).toBe('open');
    expect(chatRoomState('live', KICKOFF, KICKOFF + H)).toBe('open');
    expect(chatRoomState(undefined, undefined)).toBe('open');
  });

  it('stays open through full-time + 24h, then becomes read-only', () => {
    const end = KICKOFF + 3 * H; // internal end anchor (kickoff + match window)
    expect(chatRoomState('finished', KICKOFF, end + CHAT_ROOM_TTL_MS - 1)).toBe('open');
    expect(chatRoomState('finished', KICKOFF, end + CHAT_ROOM_TTL_MS + 1)).toBe('readonly');
  });

  it('fails open when the finished timestamp is missing', () => {
    expect(chatRoomState('finished', 0)).toBe('open');
    expect(chatRoomState('finished', null)).toBe('open');
  });

  it('gives every username a stable hue and sanitizes input', () => {
    expect(hueFor('AtlasFan')).toBe(hueFor('AtlasFan'));
    expect(hueFor('AtlasFan')).toBeGreaterThanOrEqual(0);
    expect(hueFor('AtlasFan')).toBeLessThan(360);
    expect(normalizeMessageText('  hello   world  ')).toBe('hello world');
    expect(normalizeMessageText('x'.repeat(400))).toHaveLength(280);
    expect(sanitizeNickname('<b>Fan</b>')).toBe('bFan/b');
  });
});
