import { describe, expect, it } from 'vitest';
import {
  MULTI_STREAM_SLOTS,
  buildStreamSlots,
  describeHttpStatus,
  isStreamHttpStatusFailure,
  nextFallbackSlot,
  slotIdForIndex,
  slotMap,
  streamsFromSlotMap,
} from './multiStream';

describe('multi-server stream fallback (stream1/stream2/stream3)', () => {
  it('names the first three playable sources stream1..stream3 and skips empty ones', () => {
    const slots = buildStreamSlots([
      { proxiedUrl: '/api/proxy?a=1' },
      { name: 'broken', url: '' },
      { url: 'https://cdn.example.com/2.m3u8' },
      { proxiedUrl: '/api/proxy?b=3' },
    ]);
    expect(slots.map((s) => s.slot)).toEqual(['stream1', 'stream2', 'stream3']);
    expect(slots.map((s) => s.url)).toEqual(['/api/proxy?a=1', 'https://cdn.example.com/2.m3u8', '/api/proxy?b=3']);
    expect(MULTI_STREAM_SLOTS).toEqual(['stream1', 'stream2', 'stream3']);
    expect(slotIdForIndex(3)).toBe('stream4');
  });

  it('exposes the first three slots as the API slot map and rebuilds a list from it', () => {
    const map = slotMap([{ url: '/p/1' }, { url: '/p/2' }, { url: '/p/3' }, { url: '/p/4' }]);
    expect(map).toEqual({ stream1: '/p/1', stream2: '/p/2', stream3: '/p/3' });
    expect(streamsFromSlotMap(map)).toEqual([
      { name: 'stream1', url: '/p/1' },
      { name: 'stream2', url: '/p/2' },
      { name: 'stream3', url: '/p/3' },
    ]);
    expect(streamsFromSlotMap({ stream2: '/only/2' })).toEqual([{ name: 'stream2', url: '/only/2' }]);
    expect(streamsFromSlotMap(null)).toEqual([]);
  });

  it('treats 404/410/500/502/503/504 as stream failures but never bot-wall statuses', () => {
    for (const status of [404, 410, 500, 502, 503, 504]) {
      expect(isStreamHttpStatusFailure(status)).toBe(true);
    }
    for (const status of [200, 206, 301, 401, 403, 429, 501, null, undefined, NaN]) {
      expect(isStreamHttpStatusFailure(status)).toBe(false);
    }
    expect(describeHttpStatus(404)).toContain('404');
    expect(describeHttpStatus(500)).toContain('500');
  });

  it('walks to the next untried stream, and returns null once every feed is offline', () => {
    const slots = buildStreamSlots([{ url: '/s1' }, { url: '/s2' }, { url: '/s3' }]);
    expect(nextFallbackSlot(slots, 'stream1', [])?.slot).toBe('stream2');
    expect(nextFallbackSlot(slots, 'stream1', ['stream2'])?.slot).toBe('stream3');
    expect(nextFallbackSlot(slots, 'stream2', ['stream1'])?.slot).toBe('stream3');
    // Every slot failed → null, which is the moment the tactical radar takes over.
    expect(nextFallbackSlot(slots, 'stream3', ['stream1', 'stream2', 'stream3'])).toBeNull();
    expect(nextFallbackSlot([], 'stream1', [])).toBeNull();
  });
});
