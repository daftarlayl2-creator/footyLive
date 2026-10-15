import { describe, expect, it } from 'vitest';
import {
  LEAGUES_TO_SHOW,
  computeLeagueTables,
  computeTopScorers,
  parseScorerEntry,
} from './standings';

const SAMPLE_MATCHES = [
  {
    id: 'espn-1',
    status: 'finished',
    tournament: 'Premier League',
    homeTeam: { name: 'Arsenal', badge: 'ars.png' },
    awayTeam: { name: 'Liverpool', badge: 'liv.png' },
    homeScore: 2,
    awayScore: 1,
    live: {
      scorers: {
        home: ["Bukayo Saka 20'", "Bukayo Saka 68'"],
        away: ["Mohamed Salah 45'+2'"],
      },
    },
  },
  {
    id: 'espn-2',
    status: 'live',
    tournament: 'Premier League',
    homeTeam: { name: 'Manchester City', badge: 'mci.png' },
    awayTeam: { name: 'Chelsea', badge: 'che.png' },
    homeScore: 1,
    awayScore: 1,
    live: {
      scorers: {
        home: ["Erling Haaland 12'"],
        away: ["Cole Palmer 77'"],
      },
    },
  },
  {
    id: 'espn-3',
    status: 'finished',
    tournament: 'Botola Pro',
    homeTeam: { name: 'Raja CA', badge: '' },
    awayTeam: { name: 'Wydad AC', badge: '' },
    homeScore: 2,
    awayScore: 0,
    live: {
      scorers: {
        home: ["Yousri Bouzok 34'"],
        away: [],
      },
    },
  },
];

describe('standings computation', () => {
  it('accepts both the { matches } API envelope and a raw match array', () => {
    const fromArray = computeLeagueTables(SAMPLE_MATCHES);
    const fromEnvelope = computeLeagueTables({ matches: SAMPLE_MATCHES });
    expect(fromEnvelope).toEqual(fromArray);
  });

  it('computes real per-team points, wins, draws, losses and goal difference without placeholder Team 1..20 names', () => {
    const tables = computeLeagueTables({ matches: SAMPLE_MATCHES });
    expect(tables.map((t) => t.league)).toEqual(expect.arrayContaining([...LEAGUES_TO_SHOW]));

    for (const table of tables) {
      for (const row of table.standings) {
        expect(row.name).not.toMatch(/^Team \d+$/);
      }
    }

    const epl = tables.find((t) => t.league === 'Premier League')!;
    expect(epl.matchesPlayed).toBe(2);
    expect(epl.standings[0]).toMatchObject({
      position: 1,
      name: 'Arsenal',
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 1,
      goalDifference: 1,
      points: 3,
    });

    const city = epl.standings.find((t) => t.name === 'Manchester City')!;
    expect(city).toMatchObject({
      played: 1,
      won: 0,
      drawn: 1,
      lost: 0,
      goalsFor: 1,
      goalsAgainst: 1,
      goalDifference: 0,
      points: 1,
    });

    const liverpool = epl.standings.find((t) => t.name === 'Liverpool')!;
    expect(liverpool).toMatchObject({
      played: 1,
      won: 0,
      drawn: 0,
      lost: 1,
      goalsFor: 1,
      goalsAgainst: 2,
      goalDifference: -1,
      points: 0,
    });
  });

  it('parses scorer names and tallies goals with their real club names', () => {
    expect(parseScorerEntry("Bukayo Saka 20'")).toEqual({ name: 'Bukayo Saka', count: 1 });
    expect(parseScorerEntry("Mohamed Salah 45'+2'")).toEqual({ name: 'Mohamed Salah', count: 1 });

    const scorers = computeTopScorers({ matches: SAMPLE_MATCHES });
    expect(scorers[0]).toEqual({
      rank: 1,
      name: 'Bukayo Saka',
      team: 'Arsenal',
      goals: 2,
    });
    expect(scorers.find((s) => s.name === 'Mohamed Salah')).toMatchObject({
      team: 'Liverpool',
      goals: 1,
    });
  });
});
