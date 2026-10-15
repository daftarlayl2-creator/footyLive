import { describe, expect, it } from 'vitest';
import { broadcasterMatchScore, fixtureBroadcasters } from './broadcasters';
import { normalizeEspnEvent } from '../providers/espn';

const channel = (name: string, tvgId?: string) => ({ name, tvgId });

describe('fixture broadcaster metadata', () => {
  it('merges broadcast/geoBroadcast TV names, deduplicates and excludes radio', () => {
    const competition = {
      broadcasts: [{ names: [' ESPN 2 ', 'Canal+ Sport', 'ESPN 2'] }, { type: { shortName: 'Radio' }, names: ['ESPN Radio'] }],
      geoBroadcasts: [{ media: { shortName: 'beIN SPORTS 1', name: 'beIN Sports' } }, { media: { name: 'ESPN 2' } }, { type: { name: 'Audio' }, media: { shortName: 'TalkSport' } }],
    };
    expect(fixtureBroadcasters(competition)).toEqual(['ESPN 2', 'Canal+ Sport', 'beIN SPORTS 1']);
    expect(fixtureBroadcasters({ broadcasts: {}, geoBroadcasts: null })).toEqual([]);
    expect(fixtureBroadcasters(undefined)).toEqual([]);
    expect(fixtureBroadcasters({ broadcasts: [{ names: [null, {}, '', 'x'.repeat(121)] }] })).toEqual([]);
  });

  it('retains explicit networks on normalized ESPN fixtures without inferring league rights', () => {
    const event = { id: '123', name: 'Real Madrid vs AC Milan', competitions: [{
      competitors: [{ homeAway: 'home', team: { displayName: 'Real Madrid' } }, { homeAway: 'away', team: { displayName: 'AC Milan' } }],
      broadcasts: [{ names: ['ESPN+', 'beIN SPORTS'] }],
    }] };
    expect(normalizeEspnEvent(event)?.broadcasters).toEqual(['ESPN+', 'beIN SPORTS']);
    event.competitions[0].broadcasts = [];
    expect(normalizeEspnEvent(event)?.broadcasters).toEqual([]);
  });
});

describe('network aliases and number/edition guards', () => {
  it.each([
    ['beIN Sports 1', 'beIN SPORTS 1 (1080p)'], ['beIN SPORTS', 'beIN Sports 2 HD'],
    ['ESPN 2', 'ESPN2 (United States) HD (720p)'], ['ESPN+', 'ESPN Plus HD'],
    ['Canal+ Sport 2', 'CANAL PLUS SPORT 2 SK'], ['Canal+ Sport', 'Canal+ Sport (1080p)'],
    ['Fox Sports 1', 'FS1 HD'], ['Sky Sports', 'Sky Sports (720p)'],
    ['TNT Sports 1', 'TNT Sports 1 HD'], ['beIN SPORTS XTRA', 'beIN SPORTS XTRA en Espanol (1080p)'],
  ])('matches %s to %s', (network, name) => {
    expect(broadcasterMatchScore([network], channel(name))).toBeGreaterThan(0);
  });

  it.each([
    ['beIN Sports 1', 'beIN SPORTS 2 HD'], ['ESPN 2', 'ESPN 3 HD'], ['Canal+ Sport 2', 'Canal+ Sport 3 SK'],
    ['ESPN+', 'ESPN HD'], ['ESPN', 'ESPN+ HD'], ['ESPN', 'ESPN Deportes HD'],
    ['ESPN Deportes', 'ESPN Premium HD'], ['beIN SPORTS', 'beIN SPORTS XTRA (1080p)'],
    ['Canal+', 'Canal del Congreso'], ['Unknown network', 'ESPN HD'],
  ])('does not conflate %s with %s', (network, name) => {
    expect(broadcasterMatchScore([network], channel(name))).toBe(0);
  });

  it('uses compact TVG identifiers only when the title has no recognized network', () => {
    expect(broadcasterMatchScore(['ESPN 2'], channel('Main channel HD', 'ESPN2.nl@HD'))).toBe(1);
    expect(broadcasterMatchScore(['Canal+ Sport 2'], channel('Main channel HD', 'CanalPlusSport2SK.sk@SD'))).toBe(1);
    expect(broadcasterMatchScore(['ESPN'], { name: 'ESPN Deportes HD', tvgId: 'ESPN.us@HD', tags: ['ESPN'] })).toBe(0);
    expect(broadcasterMatchScore(['ESPN 2'], { name: 'ESPN 3 HD', tvgId: 'ESPN2.us@HD', tags: ['ESPN 2'] })).toBe(0);
  });
});
