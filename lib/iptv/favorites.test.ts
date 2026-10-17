import { describe, expect, it } from 'vitest';
import { parseFavorites, serializeFavorites, toggleFavorite } from './favorites';

describe('IPTV favorites', () => {
  it('round-trips and dedupes ids', () => {
    expect(parseFavorites(serializeFavorites(['a', 'b', 'a']))).toEqual(['a', 'b']);
  });

  it('toggles membership without duplicates', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleFavorite(['a'], '')).toEqual(['a']);
  });

  it('rejects corrupt storage safely', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('not json')).toEqual([]);
    expect(parseFavorites('{"x":1}')).toEqual([]);
    expect(parseFavorites('[1, "ok", null]')).toEqual(['ok']);
  });
});
