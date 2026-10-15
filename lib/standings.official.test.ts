import { describe, expect, it } from 'vitest';
import eng1 from './providers/__fixtures__/espn-standings-eng1.json';
import usa1 from './providers/__fixtures__/espn-standings-usa1.json';
import leaders from './providers/__fixtures__/espn-leaders-eng1.json';
import botola from './providers/__fixtures__/sportsdb-table-botola.json';
import {
  DEFAULT_STANDINGS_LEAGUE,
  STANDINGS_LEAGUES,
  findStandingsLeague,
  normalizeEspnLeaders,
  normalizeEspnStandings,
  normalizeSportsDbTable,
  seasonLabelFor,
  standingsLegend,
} from './standings';

describe('league catalogue', () => {
  it('covers the major leagues with unique slugs and a valid default', () => {
    const slugs = STANDINGS_LEAGUES.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'mar.1']) {
      expect(slugs).toContain(slug);
    }
    expect(findStandingsLeague(DEFAULT_STANDINGS_LEAGUE)?.name).toBe('Premier League');
    expect(findStandingsLeague(' ESP.1 ')?.name).toBe('La Liga');
    expect(findStandingsLeague('nope')).toBeNull();
    expect(findStandingsLeague('mar.1')).toMatchObject({ provider: 'thesportsdb', sportsDbId: '4520', leaders: false });
  });
});

describe('ESPN standings normaliser', () => {
  it('maps every table column from real ESPN stats', () => {
    const { season, groups } = normalizeEspnStandings(eng1);
    expect(season).toBe('2026-27');
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBeNull();

    const [city, arsenal] = groups[0].rows;
    expect(city).toEqual({
      position: 1,
      team: {
        id: '382',
        name: 'Manchester City',
        shortName: 'Man City',
        abbreviation: 'MNC',
        logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png',
      },
      played: 6,
      won: 6,
      drawn: 0,
      lost: 0,
      goalsFor: 16,
      goalsAgainst: 5,
      goalDifference: 11,
      points: 18,
      zone: { color: '#81D6AC', label: 'Champions League' },
    });
    expect(arsenal).toMatchObject({ position: 2, played: 6, won: 5, drawn: 0, lost: 1, goalsFor: 10, goalsAgainst: 5, goalDifference: 5, points: 15 });
  });

  it('sorts unordered conference entries by the published rank', () => {
    const { season, groups } = normalizeEspnStandings(usa1);
    expect(season).toBe('2026');
    const rows = groups[0].rows;
    expect(rows.map((r) => [r.position, r.team.name])).toEqual([
      [4, 'Chicago Fire FC'],
      [13, 'Columbus Crew'],
    ]);
    expect(rows[1].goalDifference).toBe(-3);
    expect(rows[1].zone).toBeNull();
  });

  it('names groups only when a league has several (e.g. conferences)', () => {
    const twoGroups = {
      children: [
        { name: 'Eastern Conference', standings: usa1.children[0].standings },
        { name: 'Western Conference', standings: usa1.children[0].standings },
      ],
    };
    expect(normalizeEspnStandings(twoGroups).groups.map((g) => g.name)).toEqual(['Eastern Conference', 'Western Conference']);
  });

  it('returns nothing (never placeholder rows) for empty or error payloads', () => {
    expect(normalizeEspnStandings({ code: 400, message: 'Unable to retrieve any standings information' })).toEqual({ season: null, groups: [] });
    expect(normalizeEspnStandings(null).groups).toEqual([]);
  });

  it('builds a de-duplicated legend of table zones', () => {
    const { groups } = normalizeEspnStandings(eng1);
    expect(standingsLegend(groups)).toEqual([{ color: '#81D6AC', label: 'Champions League' }]);
  });
});

describe('ESPN leaders normaliser', () => {
  it('extracts top scorers with club, appearances and assists', () => {
    const scorers = normalizeEspnLeaders(leaders, 'goals');
    expect(scorers[0]).toEqual({
      rank: 1,
      player: { id: '253989', name: 'Erling Haaland', shortName: 'E. Haaland', jersey: '9' },
      team: { id: '382', name: 'Manchester City', abbreviation: 'MNC', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/382.png' },
      value: 6,
      appearances: 6,
      goals: 6,
      assists: 0,
    });
    expect(scorers[1]).toMatchObject({ rank: 2, player: { name: 'James Justin' }, team: { name: 'Leeds United' }, value: 1 });
  });

  it('extracts the assists leaderboard separately', () => {
    const assists = normalizeEspnLeaders(leaders, 'assists');
    expect(assists.map((a) => [a.rank, a.player.name, a.team.name, a.value])).toEqual([
      [1, 'Pascal Gross', 'Brighton & Hove Albion', 4],
      [2, 'Antoine Semenyo', 'Manchester City', 3],
    ]);
    // Parsed from "M: 6, G: 2: A: 3" when per-athlete statistics are absent.
    expect(assists[1]).toMatchObject({ appearances: 6, goals: 2, assists: 3 });
  });

  it('shares ranks between tied players and honours the limit', () => {
    const tied = {
      stats: [
        {
          name: 'goalsLeaders',
          leaders: [
            { value: 5, athlete: { id: '1', displayName: 'A', team: { id: '1', displayName: 'X' } } },
            { value: 4, athlete: { id: '2', displayName: 'B', team: { id: '2', displayName: 'Y' } } },
            { value: 4, athlete: { id: '3', displayName: 'C', team: { id: '3', displayName: 'Z' } } },
            { value: 3, athlete: { id: '4', displayName: 'D', team: { id: '4', displayName: 'W' } } },
          ],
        },
      ],
    };
    expect(normalizeEspnLeaders(tied, 'goals').map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(normalizeEspnLeaders(tied, 'goals', 2)).toHaveLength(2);
    expect(normalizeEspnLeaders({}, 'assists')).toEqual([]);
  });
});

describe('TheSportsDB table normaliser (Botola Pro)', () => {
  it('maps the free-tier table with form strings and qualification zones', () => {
    const groups = normalizeSportsDbTable(botola);
    expect(groups).toHaveLength(1);
    const rows = groups[0].rows;
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      position: 1,
      team: { name: 'Hassania Agadir', logo: 'https://r2.thesportsdb.com/images/media/team/badge/0ps0811573417879.png/small' },
      played: 4,
      won: 2,
      drawn: 1,
      lost: 1,
      goalsFor: 11,
      goalsAgainst: 8,
      goalDifference: 3,
      points: 7,
      form: 'DWLW',
      zone: { color: '#22c55e', label: 'Promotion - CAF Champions League (Qualification)' },
    });
    expect(rows[3]).toMatchObject({ team: { name: 'Maghreb Fez' }, zone: null });
    expect(rows[2].zone?.color).toBe('#38bdf8');
    expect(normalizeSportsDbTable({ table: null })).toEqual([]);
  });

  it('labels seasons the European way', () => {
    expect(seasonLabelFor(new Date('2026-10-15T00:00:00Z'))).toBe('2026-2027');
    expect(seasonLabelFor(new Date('2027-03-01T00:00:00Z'))).toBe('2026-2027');
  });
});
