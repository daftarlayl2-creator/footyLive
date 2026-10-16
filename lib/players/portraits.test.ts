import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/providers/http', () => ({ fetchJson: vi.fn() }));
vi.mock('@/lib/cache/cacheManager', () => ({ getCacheManager: () => ({ swr: (_key: string, load: () => unknown) => load() }) }));

import { fetchJson } from '@/lib/providers/http';
import {
  buildPortraitSources, espnHeadshotUrl, lookupSportsDbImages, pickSportsDbPlayer, SPORTSDB_PLAYER_API, sportsDbImages, withPortraits,
} from './portraits';
import type { PlayerProfile } from './types';

const YAMAL = { name: 'Lamine Yamal', fullName: 'Lamine Yamal Nasraoui Ebana', dateOfBirth: '2007-07-13T00:00:00Z' };
const hit = (overrides: Record<string, unknown> = {}) => ({
  idPlayer: '34172318', strPlayer: 'Lamine Yamal', strSport: 'Soccer', dateBorn: '2007-07-13',
  strCutout: 'https://r2.thesportsdb.com/images/media/player/cutout/yamal.png',
  strRender: 'https://r2.thesportsdb.com/images/media/player/render/yamal.png',
  strThumb: 'https://www.thesportsdb.com/images/media/player/thumb/yamal.jpg',
  ...overrides,
});
const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: '362150', name: 'Lamine Yamal', position: 'Forward', season: { label: 'x', current: false }, honors: [], updatedAt: 0, ...overrides,
});

describe('TheSportsDB identity matching', () => {
  it('accepts only a soccer player with the same date of birth', () => {
    expect(pickSportsDbPlayer({ player: [hit({ dateBorn: '1990-01-01' }), hit()] }, YAMAL)?.dateBorn).toBe('2007-07-13');
    // Namesakes, other sports and missing payloads never lend their face.
    expect(pickSportsDbPlayer({ player: [hit({ dateBorn: '2001-02-03' })] }, YAMAL)).toBeNull();
    expect(pickSportsDbPlayer({ player: [hit({ strSport: 'Basketball' })] }, YAMAL)).toBeNull();
    expect(pickSportsDbPlayer({ player: null }, YAMAL)).toBeNull();
    expect(pickSportsDbPlayer('rate limited', YAMAL)).toBeNull();
    expect(pickSportsDbPlayer({ player: [hit({ strPlayer: 'An unrelated player with the same birthday' })] }, YAMAL)).toBeNull();
    expect(pickSportsDbPlayer({ player: [hit(), hit({ idPlayer: '2' })] }, YAMAL)).toBeNull();
  });

  it('without a birth date, needs one exact, unambiguous name', () => {
    const noDob = { name: 'Pedri' };
    expect(pickSportsDbPlayer({ player: [hit({ strPlayer: 'Pedri', dateBorn: '2002-11-25' })] }, noDob)?.strPlayer).toBe('Pedri');
    expect(pickSportsDbPlayer({ player: [hit({ strPlayer: 'Pedri' }), hit({ strPlayer: 'Pedri', idPlayer: '2' })] }, noDob)).toBeNull();
    expect(pickSportsDbPlayer({ player: [hit({ strPlayer: 'Pedrinho' })] }, noDob)).toBeNull();
  });

  it('keeps only HTTPS images served by TheSportsDB', () => {
    expect(sportsDbImages(hit())).toEqual({
      cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/yamal.png',
      render: 'https://r2.thesportsdb.com/images/media/player/render/yamal.png',
      thumb: 'https://www.thesportsdb.com/images/media/player/thumb/yamal.jpg',
    });
    expect(sportsDbImages(hit({ strCutout: 'http://www.thesportsdb.com/x.png', strRender: 'https://evil.example/x.png', strThumb: 'javascript:alert(1)' }))).toEqual({});
    expect(sportsDbImages(null)).toEqual({});
    expect(sportsDbImages(hit({ strCutout: 'https://www.thesportsdb.com/x.jpg', strRender: 'https://r2.thesportsdb.com/x.webp', strThumb: null }))).toEqual({});
  });
});

describe('portrait candidates', () => {
  const images = sportsDbImages(hit());
  it('leads every player with transparent action renders and cutouts, never an opaque photo', () => {
    const espn = 'https://a.espncdn.com/i/headshots/soccer/players/full/362150.png';
    const featured = buildPortraitSources(profile({ featured: true, portrait: 'https://cdn.example.com/espn-api.png' }), images);
    // Cutouts lead; ESPN's transparent full PNG, the id-pattern PNG and the
    // 1024-px combiner variant follow as headshot fallbacks.
    expect(featured.map(({ kind, credit }) => `${kind}:${credit}`)).toEqual([
      'cutout:TheSportsDB', 'cutout:TheSportsDB', 'headshot:ESPN', 'headshot:ESPN', 'headshot:ESPN',
    ]);
    expect(featured[0].src).toBe(images.render);

    const regular = buildPortraitSources(profile({ portrait: espn }), images);
    // The ESPN portrait and the id-pattern URL are the same file: de-duplicated.
    expect(regular.map(({ src }) => src)).toEqual([
      images.render, images.cutout, espn,
      'https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/362150.png&w=1024&h=1024',
    ]);
    expect(regular[regular.length - 1].src).toBe('https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/362150.png&w=1024&h=1024');
  });

  it('falls back to the ESPN id headshot and never duplicates a URL', () => {
    expect(espnHeadshotUrl('362150')).toBe('https://a.espncdn.com/i/headshots/soccer/players/full/362150.png');
    expect(espnHeadshotUrl('../x')).toBeUndefined();
    const fallback = buildPortraitSources(profile());
    expect(fallback).toHaveLength(2);
    expect(fallback[0]).toEqual({ src: espnHeadshotUrl('362150'), kind: 'headshot', credit: 'ESPN' });
    expect(new Set(fallback.map(({ src }) => src)).size).toBe(fallback.length);
  });

  it('looks TheSportsDB up for every player, and survives provider outages', async () => {
    const lookup = vi.fn(async () => images);
    expect((await withPortraits(profile({ portrait: 'https://cdn.example.com/espn.png' }), lookup)).portraits).toHaveLength(5);
    expect(lookup).toHaveBeenCalledOnce();
    expect((await withPortraits(profile({ featured: true, portrait: 'https://cdn.example.com/espn.png' }), lookup)).portraits?.[0].kind).toBe('cutout');
    expect((await withPortraits(profile(), lookup)).portraits?.[0].src).toBe(images.render);
    expect(lookup).toHaveBeenCalledTimes(3);
    const down = await withPortraits(profile({ featured: true }), async () => { throw new Error('HTTP 429'); });
    expect(down.portraits?.[0].src).toBe(espnHeadshotUrl('362150'));
  });

  it('uses the full-size PNG path and ignores opaque ESPN thumbnails', () => {
    const thumb = 'https://a.espncdn.com/i/headshots/soccer/players/thumb/362150.png';
    expect(buildPortraitSources(profile({ portrait: thumb }))[0].src).toBe(espnHeadshotUrl('362150'));
    expect(buildPortraitSources(profile({ portrait: 'https://cdn.example/a.jpg' }))[0]).toEqual({ src: espnHeadshotUrl('362150'), kind: 'headshot', credit: 'ESPN' });
  });

  it('searches by display name, then the full name', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ player: null }).mockResolvedValueOnce({ player: [hit()] });
    expect(await lookupSportsDbImages({ id: '362150', ...YAMAL })).toEqual(images);
    expect(vi.mocked(fetchJson).mock.calls.map(([url]) => url)).toEqual([
      `${SPORTSDB_PLAYER_API}/searchplayers.php?p=Lamine%20Yamal`,
      `${SPORTSDB_PLAYER_API}/searchplayers.php?p=Lamine%20Yamal%20Nasraoui%20Ebana`,
    ]);
  });
});
