import { describe, expect, it } from 'vitest';
import team from '../providers/__fixtures__/espn-team-arsenal.json';
import schedule from '../providers/__fixtures__/espn-schedule-arsenal.json';
import fixtures from '../providers/__fixtures__/espn-fixtures-arsenal.json';
import roster from '../providers/__fixtures__/espn-roster-arsenal.json';
import search from '../providers/__fixtures__/espn-search-real-madrid.json';
import wikiSummary from '../providers/__fixtures__/wiki-summary-arsenal.json';
import wikiSearchInter from '../providers/__fixtures__/wiki-search-inter.json';
import wikiSearchRaja from '../providers/__fixtures__/wiki-search-raja.json';
import { clubHref, nameFromSlug, parseClubParam, slugifyClubName } from './links';
import { heroPalette, luminance, normalizeHex } from './colors';
import { resizedEspnImage, initialsForClub } from './images';
import {
  formFromResults,
  groupSquad,
  homeVenueFrom,
  normalizeEspnTeam,
  normalizeRoster,
  normalizeTeamSchedule,
  pickEspnTeamSearchHit,
  positionGroup,
} from './espnClub';
import { parseWikipediaSummary, pickCurrentStatement, pickWikipediaTitle, statementEntityId, statementYear } from './wiki';
import { fallbackClubBio } from './clubProfile';

describe('club links', () => {
  it('slugifies names without accents or punctuation', () => {
    expect(slugifyClubName('Brighton & Hove Albion')).toBe('brighton-and-hove-albion');
    expect(slugifyClubName('Atlético Madrid')).toBe('atletico-madrid');
    expect(slugifyClubName('Maghreb de Fès')).toBe('maghreb-de-fes');
    expect(slugifyClubName("St. Patrick's Athletic")).toBe('st-patricks-athletic');
    expect(slugifyClubName('')).toBe('');
  });

  it('prefers the ESPN id and falls back to a name slug', () => {
    expect(clubHref({ id: '359', name: 'Arsenal' })).toBe('/club/359-arsenal');
    expect(clubHref({ id: 86, name: 'Real Madrid' })).toBe('/club/86-real-madrid');
    expect(clubHref({ name: 'Raja CA' })).toBe('/club/raja-ca');
    expect(clubHref({ id: 'wf-12', name: 'Wydad AC' })).toBe('/club/wydad-ac');
    expect(clubHref({ name: '' })).toBeNull();
    expect(clubHref(null)).toBeNull();
  });

  it('parses route params back into ESPN ids and slugs', () => {
    expect(parseClubParam('359-arsenal')).toEqual({ espnId: '359', slug: 'arsenal' });
    expect(parseClubParam('359')).toEqual({ espnId: '359', slug: '' });
    expect(parseClubParam('real-madrid')).toEqual({ espnId: null, slug: 'real-madrid' });
    expect(parseClubParam('Maghreb%20de%20F%C3%A8s')).toEqual({ espnId: null, slug: 'maghreb-de-fes' });
    expect(parseClubParam('%E0%A4%A')).toEqual({ espnId: null, slug: 'e0-a4-a' });
    expect(nameFromSlug('brighton-and-hove-albion')).toBe('brighton and hove albion');
  });
});

describe('club colours & images', () => {
  it('normalises ESPN hex colours', () => {
    expect(normalizeHex('e20520')).toBe('#e20520');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex('red')).toBeNull();
  });

  it('keeps hero gradients dark enough for white text, even for white kits', () => {
    const arsenal = heroPalette('e20520', '003399');
    expect(arsenal.swatches).toEqual(['#e20520', '#003399']);
    expect(luminance(arsenal.from)).toBeLessThanOrEqual(0.18);

    const leeds = heroPalette('ffffff', 'ffffff');
    expect(leeds.swatches).toEqual(['#ffffff']);
    expect(luminance(leeds.from)).toBeLessThanOrEqual(0.18);
    expect(luminance(leeds.to)).toBeLessThanOrEqual(0.08);

    expect(heroPalette(null, undefined)).toEqual({ from: '#572339', to: '#18030a', swatches: [] });
  });

  it('requests resized ESPN crests and leaves other hosts alone', () => {
    expect(resizedEspnImage('https://a.espncdn.com/i/teamlogos/soccer/500/359.png', 48)).toBe(
      'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/359.png&w=48&h=48'
    );
    expect(resizedEspnImage('https://r2.thesportsdb.com/x.png/small', 48)).toBe('https://r2.thesportsdb.com/x.png/small');
    expect(resizedEspnImage(undefined, 48)).toBeNull();
    expect(initialsForClub('FC Barcelona')).toBe('BAR');
    expect(initialsForClub('Manchester United')).toBe('MU');
  });
});

describe('ESPN club normalisers', () => {
  it('normalises the team profile with colours, league and record', () => {
    expect(normalizeEspnTeam(team)).toEqual({
      espnId: '359',
      name: 'Arsenal',
      abbreviation: 'ARS',
      nickname: 'Gunners',
      location: 'Arsenal',
      logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
      logoDark: 'https://a.espncdn.com/i/teamlogos/soccer/500-dark/359.png',
      color: '#e20520',
      alternateColor: '#003399',
      league: { slug: 'eng.1', name: 'Premier League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
      standingSummary: '2nd in English Premier League',
      record: { played: 6, wins: 5, draws: 0, losses: 1, points: 15, goalsFor: 10, goalsAgainst: 5, rank: 2 },
    });
    expect(normalizeEspnTeam({ code: 404 })).toBeNull();
  });

  it('turns schedules into club-perspective results across competitions', () => {
    const results = normalizeTeamSchedule(schedule, '359');
    expect(results.map((m) => [m.id, m.competition, m.result])).toEqual([
      ['401879268', 'Premier League', 'W'],
      ['401915417', 'UEFA Champions League', 'W'],
    ]);
    const lille = results[1];
    expect(lille).toMatchObject({
      status: 'finished',
      statusDetail: 'FT',
      venue: 'Emirates Stadium',
      city: 'London',
      isHome: true,
      opponent: { id: '166', name: 'Lille', score: 0 },
      home: { id: '359', score: 3 },
    });
    expect(formFromResults(results)).toEqual(['W', 'W']);
    expect(homeVenueFrom(results)).toBe('Emirates Stadium');
  });

  it('parses upcoming fixtures without inventing scores', () => {
    const [next] = normalizeTeamSchedule(fixtures, '359');
    expect(next).toMatchObject({
      id: '401878769',
      status: 'scheduled',
      isHome: false,
      venue: 'The City Ground',
      opponent: { id: '393', name: 'Nottingham Forest', shortName: 'Nottm Forest' },
    });
    expect(next.result).toBeUndefined();
    expect(next.opponent.score).toBeUndefined();
  });

  it('decides level matches by shootout and handles string scores', () => {
    const shootout = {
      events: [
        {
          id: '1',
          date: '2026-08-01T18:00Z',
          season: { displayName: '2026 English FA Cup' },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: '359', displayName: 'Arsenal' }, score: '1', shootoutScore: 4 },
                { homeAway: 'away', team: { id: '360', displayName: 'Manchester United' }, score: '1', shootoutScore: 5 },
              ],
              status: { type: { state: 'post', completed: true, name: 'STATUS_FINAL_PEN' } },
            },
          ],
        },
        {
          id: '2',
          date: '2026-08-08T18:00Z',
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { id: '1', displayName: 'Other' }, score: '0' },
                { homeAway: 'away', team: { id: '2', displayName: 'Club' }, score: '0' },
              ],
              status: { type: { state: 'post', completed: true } },
            },
          ],
        },
      ],
    };
    const matches = normalizeTeamSchedule(shootout, '359');
    expect(matches).toHaveLength(1); // the second event does not involve the club
    expect(matches[0]).toMatchObject({ result: 'L', competition: 'English FA Cup', opponent: { shootout: 5 } });
  });

  it('normalises the roster and ignores ESPN’s stale coach field', () => {
    const players = normalizeRoster(roster);
    expect(players).toEqual([
      {
        id: '169532',
        name: 'Kepa Arrizabalaga',
        jersey: '13',
        position: 'Goalkeeper',
        group: 'Goalkeepers',
        age: 32,
        nationality: 'Spain',
        flag: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png',
        appearances: 0,
        goals: 0,
        assists: 0,
      },
    ]);
    expect(JSON.stringify(players)).not.toContain('Wenger');
  });

  it('groups the squad by line and sorts by shirt number', () => {
    const squad = groupSquad([
      { id: '1', name: 'Striker', jersey: '9', position: 'Forward', group: 'Forwards' },
      { id: '2', name: 'Keeper B', jersey: '22', position: 'Goalkeeper', group: 'Goalkeepers' },
      { id: '3', name: 'Keeper A', jersey: '1', position: 'Goalkeeper', group: 'Goalkeepers' },
      { id: '4', name: 'Mid', position: 'Midfielder', group: 'Midfielders' },
    ]);
    expect(squad.map((g) => [g.group, g.players.map((p) => p.name)])).toEqual([
      ['Goalkeepers', ['Keeper A', 'Keeper B']],
      ['Midfielders', ['Mid']],
      ['Forwards', ['Striker']],
    ]);
    expect(positionGroup({ abbreviation: 'CB' })).toBe('Defenders');
    expect(positionGroup({ name: 'Left Winger' })).toBe('Forwards');
    expect(positionGroup(null)).toBe('Squad');
  });

  it('picks the senior men’s team from ESPN search results', () => {
    expect(pickEspnTeamSearchHit(search, 'real madrid')).toEqual({
      espnId: '86',
      name: 'Real Madrid',
      league: 'LALIGA',
      leagueSlug: 'esp.1',
      logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png',
    });
    expect(pickEspnTeamSearchHit(search, 'real madrid castilla')?.espnId).toBe('7000');
    expect(pickEspnTeamSearchHit({ results: [] }, 'nobody')).toBeNull();
  });
});

describe('Wikipedia / Wikidata parsers', () => {
  it('finds the club article and skips "in international football" pages', () => {
    expect(pickWikipediaTitle(wikiSearchInter, 'Internazionale')).toBe('Inter Milan');
    expect(pickWikipediaTitle(wikiSearchRaja, 'Raja Casablanca')).toBe('Raja CA');
    expect(pickWikipediaTitle({ query: { search: [] } }, 'Nobody')).toBeNull();
  });

  it('parses the REST summary into a bio with attribution data', () => {
    expect(parseWikipediaSummary(wikiSummary)).toMatchObject({
      title: 'Arsenal F.C.',
      url: 'https://en.wikipedia.org/wiki/Arsenal_F.C.',
      description: 'Association football club in England',
      wikidataId: 'Q9617',
    });
    expect(parseWikipediaSummary(wikiSummary)?.extract).toMatch(/^The Arsenal Football Club/);
    expect(parseWikipediaSummary({ type: 'disambiguation', title: 'X', extract: 'y' })).toBeNull();
  });

  const coach = (id: string, start: string, end?: string, rank = 'normal') => ({
    rank,
    mainsnak: { snaktype: 'value', property: 'P286', datavalue: { value: { 'entity-type': 'item', id }, type: 'wikibase-entityid' } },
    qualifiers: {
      P580: [{ datavalue: { value: { time: start } } }],
      ...(end ? { P582: [{ datavalue: { value: { time: end } } }] } : {}),
    },
  });

  it('picks the current head coach — the statement without an end date', () => {
    const claims = [
      coach('Q295610', '+2018-05-23T00:00:00Z', '+2019-11-29T00:00:00Z'),
      coach('Q47576', '+1996-10-01T00:00:00Z', '+2018-05-21T00:00:00Z'),
      coach('Q1000001', '+2019-12-20T00:00:00Z'),
    ];
    expect(statementEntityId(pickCurrentStatement(claims, new Date('2026-10-15')))).toBe('Q1000001');
  });

  it('honours future end dates, preferred rank and deprecated statements', () => {
    const now = new Date('2026-10-15');
    expect(statementEntityId(pickCurrentStatement([coach('Q1', '+2025-07-01T00:00:00Z', '+2027-06-30T00:00:00Z')], now))).toBe('Q1');
    expect(
      statementEntityId(pickCurrentStatement([coach('Q2', '+2024-01-01T00:00:00Z'), coach('Q3', '+2023-01-01T00:00:00Z', undefined, 'preferred')], now))
    ).toBe('Q3');
    expect(pickCurrentStatement([{ ...coach('Q4', '+2024-01-01T00:00:00Z'), rank: 'deprecated' }], now)).toBeNull();
    expect(pickCurrentStatement([coach('Q5', '+2001-01-01T00:00:00Z', '+2002-01-01T00:00:00Z')], now)).toBeNull();
  });

  it('reads founding years from imprecise Wikidata dates', () => {
    expect(statementYear({ mainsnak: { datavalue: { value: { time: '+1886-12-01T00:00:00Z' } } } })).toBe(1886);
    expect(statementYear({ mainsnak: { datavalue: { value: { time: '+1919-00-00T00:00:00Z' } } } })).toBe(1919);
    expect(statementYear(null)).toBeNull();
  });
});

describe('fallback bio', () => {
  it('is composed only from live ESPN data', () => {
    const club = normalizeEspnTeam(team)!;
    expect(fallbackClubBio(club)).toBe(
      'Arsenal — nicknamed “Gunners” — compete in the Premier League. They are currently 2nd in English Premier League. This season they have won 5, drawn 0 and lost 1 of their 6 league matches.'
    );
    expect(fallbackClubBio({ espnId: '1', name: 'Club' })).toBe('Club is a professional football club.');
  });
});
