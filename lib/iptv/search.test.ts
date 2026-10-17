import { describe, expect, it } from 'vitest';
import { channelSearchScore, foldText, searchChannels } from './search';

describe('foldText', () => {
  it('folds accents, case and punctuation', () => {
    expect(foldText('beIN SPORTS 1 (HD)')).toBe('bein sports 1 hd');
    expect(foldText('Café TV — Ça')).toBe('cafe tv ca');
  });
});

describe('channel search', () => {
  const channels = [
    { name: 'beIN SPORTS 1' },
    { name: 'Al Jazeera English' },
    { name: 'France 24 English' },
    { name: '2M Monde' },
  ];

  it('matches case/accent-insensitively and ranks exact/prefix first', () => {
    expect(searchChannels(channels, 'bein').map((c) => c.name)).toEqual(['beIN SPORTS 1']);
    expect(searchChannels(channels, 'FRANCE 24').map((c) => c.name)).toEqual(['France 24 English']);
    expect(channelSearchScore('2M Monde', '2m monde')).toBe(100);
  });

  it('tolerates small typos via subsequence tokens', () => {
    expect(searchChannels(channels, 'aljazera').map((c) => c.name)).toEqual(['Al Jazeera English']);
    expect(searchChannels(channels, 'frnce').map((c) => c.name)).toEqual(['France 24 English']);
  });

  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(searchChannels(channels, '')).toEqual(channels);
    expect(searchChannels(channels, 'zzqqx')).toEqual([]);
  });
});
