import { describe, expect, it } from 'vitest';
import {
  classifyEspnEventType,
  espnDateString,
  getEspnMatchStats,
  isEspnMatchId,
  leagueSlugFromSeasonSlug,
  minuteFromStatus,
  normalizeEspnEvent,
  parseEspnBoxscoreTeams,
  parseEspnCommentary,
  parseEspnDetails,
  parseEspnEventId,
  tournamentFromSeasonSlug,
} from './espn';
import { attachStreamSources } from '../streamEngine';
import type { Match } from '../types';

/* Real ESPN payload shapes (trimmed) — the parser must handle these verbatim. */

const IN_PROGRESS_EVENT = {
  id: '700001',
  date: '2026-10-14T19:00Z',
  name: 'Arsenal vs Liverpool',
  shortName: 'ARS vs LIV',
  season: { year: 2026, slug: '2026-27-english-premier-league' },
  competitions: [
    {
      id: '700001',
      date: '2026-10-14T19:00Z',
      status: {
        clock: 3720,
        displayClock: '62:00',
        period: 2,
        type: {
          id: '2',
          name: 'STATUS_IN_PROGRESS',
          state: 'in',
          completed: false,
          description: 'In Progress',
          detail: "62'",
          shortDetail: "62'",
        },
      },
      venue: { fullName: 'Emirates Stadium', address: { city: 'London' } },
      competitors: [
        {
          id: '359',
          homeAway: 'home',
          score: '2',
          winner: false,
          team: {
            id: '359',
            displayName: 'Arsenal',
            abbreviation: 'ARS',
            logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
          },
        },
        {
          id: '364',
          homeAway: 'away',
          score: '1',
          winner: false,
          team: { id: '364', displayName: 'Liverpool', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png' },
        },
      ],
      details: [
        {
          type: { id: '70', text: 'Goal' },
          clock: { value: 1200, displayValue: "20'" },
          team: { id: '359' },
          scoringPlay: true,
          athletesInvolved: [{ displayName: 'Bukayo Saka' }],
        },
        {
          type: { id: '89', text: 'Penalty - Scored' },
          clock: { value: 2700, displayValue: "45'+0'" },
          team: { id: '364' },
          scoringPlay: true,
          penalty: true,
          athletesInvolved: [{ displayName: 'Mohamed Salah' }],
        },
        {
          type: { id: '94', text: 'Yellow Card' },
          clock: { value: 2400, displayValue: "40'" },
          team: { id: '364' },
          athletesInvolved: [{ displayName: 'Alexis Mac Allister' }],
        },
        {
          type: { id: '93', text: 'Red Card' },
          clock: { value: 3600, displayValue: "60'" },
          team: { id: '364' },
          athletesInvolved: [{ displayName: 'Virgil van Dijk' }],
        },
      ],
    },
  ],
};

const SCHEDULED_EVENT = {
  id: '700002',
  date: '2026-10-14T21:00Z',
  name: 'Real Madrid vs Barcelona',
  season: { year: 2026, slug: '2026-27-spanish-la-liga' },
  competitions: [
    {
      id: '700002',
      date: '2026-10-14T21:00Z',
      status: {
        clock: 0,
        displayClock: '0:00',
        period: 0,
        type: {
          id: '1',
          name: 'STATUS_SCHEDULED',
          state: 'pre',
          completed: false,
          description: 'Scheduled',
          detail: 'Scheduled',
          shortDetail: 'Scheduled',
        },
      },
      competitors: [
        { id: '86', homeAway: 'home', score: '0', team: { id: '86', displayName: 'Real Madrid' } },
        { id: '83', homeAway: 'away', score: '0', team: { id: '83', displayName: 'Barcelona' } },
      ],
      details: [],
    },
  ],
};

const FINISHED_EVENT = {
  id: '700003',
  date: '2026-10-14T15:00Z',
  name: 'Inter vs Napoli',
  season: { year: 2026, slug: '2026-27-italian-serie-a' },
  competitions: [
    {
      id: '700003',
      date: '2026-10-14T15:00Z',
      status: { clock: 5400, displayClock: '90:00', period: 2, type: { state: 'post', name: 'STATUS_FULL_TIME', description: 'Full Time', detail: 'FT', shortDetail: 'FT' } },
      competitors: [
        { id: '110', homeAway: 'home', score: '3', winner: true, team: { id: '110', displayName: 'Inter' } },
        { id: '114', homeAway: 'away', score: '0', winner: false, team: { id: '114', displayName: 'Napoli' } },
      ],
      details: [],
    },
  ],
};

const POSTPONED_EVENT = {
  id: '700004',
  date: '2026-10-14T18:00Z',
  name: 'Nice vs Marseille',
  season: { year: 2026, slug: '2026-27-french-ligue-1' },
  competitions: [
    {
      id: '700004',
      date: '2026-10-14T18:00Z',
      status: { type: { state: 'post', name: 'STATUS_POSTPONED', description: 'Postponed', detail: 'Postponed', shortDetail: 'Postponed' } },
      competitors: [
        { id: '2502', homeAway: 'home', score: '0', team: { id: '2502', displayName: 'Nice' } },
        { id: '176', homeAway: 'away', score: '0', team: { id: '176', displayName: 'Marseille' } },
      ],
      details: [],
    },
  ],
};

describe('espn ids and dates', () => {
  it('builds ESPN day strings', () => {
    const now = new Date('2026-10-14T23:30:00Z');
    expect(espnDateString(0, now)).toBe('20261014');
    expect(espnDateString(-1, now)).toBe('20261013');
    expect(espnDateString(1, now)).toBe('20261015');
  });

  it('round-trips match ids', () => {
    expect(isEspnMatchId('espn-700001')).toBe(true);
    expect(isEspnMatchId('abc123')).toBe(false);
    expect(parseEspnEventId('espn-700001')).toBe('700001');
    expect(parseEspnEventId('espn-nope')).toBeNull();
    expect(parseEspnEventId('123456')).toBeNull();
  });
});

describe('tournament naming from real ESPN season slugs', () => {
  it('maps slugs to display names', () => {
    expect(tournamentFromSeasonSlug('2025-26-english-premier-league')).toBe('Premier League');
    expect(tournamentFromSeasonSlug('2026-uefa-champions-league')).toBe('UEFA Champions League');
    expect(tournamentFromSeasonSlug('2026-27-spanish-la-liga')).toBe('La Liga');
    expect(tournamentFromSeasonSlug('2026-27-italian-serie-a')).toBe('Serie A');
    expect(tournamentFromSeasonSlug('2026-27-brazilian-serie-a')).toBe('Brazilian Serie A');
    expect(tournamentFromSeasonSlug(undefined)).toBe('Football');
  });

  it('exposes league slug hints for summary lookups', () => {
    expect(leagueSlugFromSeasonSlug('2025-26-english-premier-league')).toBe('eng.1');
    expect(leagueSlugFromSeasonSlug('2026-uefa-champions-league')).toBe('uefa.champions');
    expect(leagueSlugFromSeasonSlug('2026-some-unknown-league')).toBeNull();
  });
});

describe('minute derivation', () => {
  it('prefers the upstream display value', () => {
    expect(minuteFromStatus({ clock: 3720, period: 2, type: { detail: "62'", shortDetail: "62'" } })).toEqual({
      label: "62'",
      minute: 62,
    });
    expect(minuteFromStatus({ type: { shortDetail: 'HT' } })).toEqual({ label: 'HT', minute: 0 });
  });

  it('falls back to the clock', () => {
    expect(minuteFromStatus({ clock: 3720, period: 2, type: {} }).minute).toBe(62);
    expect(minuteFromStatus({ clock: 600, period: 2, type: {} }).minute).toBe(55);
    expect(minuteFromStatus({ clock: 300, period: 3, type: {} }).minute).toBe(95);      // period-relative clock
    expect(minuteFromStatus({ clock: 5700, period: 3, type: {} }).minute).toBe(95);     // continuous clock
  });
});

describe('normalising real ESPN events', () => {
  it('maps a live match with score, minute, cards and scorers', () => {
    const match = normalizeEspnEvent(IN_PROGRESS_EVENT)!;

    expect(match.id).toBe('espn-700001');
    expect(match.status).toBe('live');
    expect(match.source).toBe('espn');
    expect(match.title).toBe('Arsenal vs Liverpool');
    expect(match.tournament).toBe('Premier League');
    expect(match.leagueSlug).toBe('eng.1');
    expect(match.country).toBe('England');
    expect(match.homeTeam.name).toBe('Arsenal');
    expect(match.homeTeam.badge).toContain('359.png');
    expect(match.homeScore).toBe(2);
    expect(match.awayScore).toBe(1);
    expect(match.currentMinute).toBe("62'");
    expect(match.currentMinuteNumber).toBe(62);
    expect(match.venue).toBe('Emirates Stadium');
    expect(match.timestamp).toBe(Date.parse('2026-10-14T19:00Z'));

    expect(match.live?.cards.home).toEqual({ yellow: 0, red: 0 });
    expect(match.live?.cards.away).toEqual({ yellow: 1, red: 1 });
    expect(match.live?.scorers.home).toEqual(["Bukayo Saka 20'"]);
    expect(match.live?.scorers.away).toEqual(["Mohamed Salah 45'+0'"]);
    expect(match.live?.events).toHaveLength(4);
    expect(match.live?.events[1].type).toBe('penalty');
  });

  it('maps upcoming and finished matches', () => {
    const upcoming = normalizeEspnEvent(SCHEDULED_EVENT)!;
    expect(upcoming.status).toBe('upcoming');
    expect(upcoming.currentMinute).toBe('');
    expect(upcoming.currentMinuteNumber).toBe(0);
    expect(upcoming.live).toBeUndefined();
    expect(upcoming.tournament).toBe('La Liga');
    expect(upcoming.country).toBe('Spain');

    const finished = normalizeEspnEvent(FINISHED_EVENT)!;
    expect(finished.status).toBe('finished');
    expect(finished.currentMinute).toBe('FT');
    expect(finished.homeScore).toBe(3);
    expect(finished.awayScore).toBe(0);
    expect(finished.tournament).toBe('Serie A');
  });

  it('keeps postponed fixtures in the upcoming list with a note', () => {
    const postponed = normalizeEspnEvent(POSTPONED_EVENT)!;
    expect(postponed.status).toBe('upcoming');
    expect(postponed.note).toBe('Postponed');
  });

  it('ignores malformed events instead of inventing data', () => {
    expect(normalizeEspnEvent(null)).toBeNull();
    expect(normalizeEspnEvent({ id: '1' })).toBeNull();
    expect(normalizeEspnEvent({ id: '1', competitions: [{ competitors: [] }] })).toBeNull();
  });
});

describe('event details parsing', () => {
  it('classifies upstream event types', () => {
    expect(classifyEspnEventType('Goal')).toBe('goal');
    expect(classifyEspnEventType('Own Goal')).toBe('own-goal');
    expect(classifyEspnEventType('Penalty - Scored')).toBe('penalty');
    expect(classifyEspnEventType('Penalty - Missed')).toBe('other');
    expect(classifyEspnEventType('Yellow Card')).toBe('yellow');
    expect(classifyEspnEventType('Second Yellow card')).toBe('red');
    expect(classifyEspnEventType('Red Card')).toBe('red');
    expect(classifyEspnEventType('Substitution')).toBe('substitution');
  });

  it('counts second yellows as both a booking and a red', () => {
    const { cards } = parseEspnDetails(
      {
        details: [
          { type: { text: 'Second Yellow card' }, clock: { displayValue: "70'" }, team: { id: '359' } },
        ],
      },
      '359'
    );
    expect(cards.home).toEqual({ yellow: 1, red: 1 });
    expect(cards.away).toEqual({ yellow: 0, red: 0 });
  });

  it('credits own goals to the opposing side', () => {
    const { scorers } = parseEspnDetails(
      {
        details: [
          {
            type: { text: 'Own Goal' },
            clock: { displayValue: "12'" },
            team: { id: '364' },
            ownGoal: true,
            athletesInvolved: [{ displayName: 'Joel Matip' }],
          },
        ],
      },
      '359'
    );
    expect(scorers.home).toEqual(["Joel Matip 12'"]);
    expect(scorers.away).toEqual([]);
  });

  it('returns structured goals with penalty and own-goal flags, credited to the scoring side', () => {
    const { goals } = parseEspnDetails(
      {
        details: [
          { type: { text: 'Goal' }, clock: { displayValue: "15'" }, team: { id: '103' }, athletesInvolved: [{ displayName: 'Alphadjo Cissè' }] },
          { type: { text: 'Yellow Card' }, clock: { displayValue: "20'" }, team: { id: '110' }, athletesInvolved: [{ displayName: 'Booked Player' }] },
          { type: { text: 'Penalty - Scored' }, clock: { displayValue: "32'" }, team: { id: '103' }, penalty: true, athletesInvolved: [{ displayName: 'Alphadjo Cissè' }] },
          { type: { text: 'Own Goal' }, clock: { displayValue: "90'+2'" }, team: { id: '103' }, ownGoal: true, athletesInvolved: [{ displayName: 'Unlucky Defender' }] },
          { type: { text: 'Goal' }, clock: { displayValue: "60'" }, team: { id: '110' } },
        ],
      },
      '103'
    );
    expect(goals).toEqual([
      { side: 'home', player: 'Alphadjo Cissè', minute: "15'", penalty: false, ownGoal: false },
      { side: 'home', player: 'Alphadjo Cissè', minute: "32'", penalty: true, ownGoal: false },
      { side: 'away', player: 'Unlucky Defender', minute: "90'+2'", penalty: false, ownGoal: true },
      { side: 'away', player: '', minute: "60'", penalty: false, ownGoal: false },
    ]);
  });
});

describe('statistics mapping', () => {
  const boxscore = {
    teams: [
      {
        homeAway: 'home',
        team: { displayName: 'Arsenal' },
        statistics: [
          { name: 'possessionPct', label: 'Possession', displayValue: '58.4' },
          { name: 'totalShots', label: 'Shots', displayValue: '14' },
          { name: 'wonCorners', label: 'Corner Kicks', displayValue: '7' },
          { name: 'foulsCommitted', label: 'Fouls', displayValue: '9' },
        ],
      },
      {
        homeAway: 'away',
        team: { displayName: 'Liverpool' },
        statistics: [
          { name: 'possessionPct', label: 'Possession', displayValue: '41.6' },
          { name: 'totalShots', label: 'Shots', displayValue: '6' },
          { name: 'wonCorners', label: 'Corner Kicks', displayValue: '3' },
          { name: 'foulsCommitted', label: 'Fouls', displayValue: '11' },
        ],
      },
    ],
  };

  it('builds proportional comparison rows for both sides', () => {
    const teams = parseEspnBoxscoreTeams(
      boxscore,
      { name: 'Arsenal', badge: 'a.png' },
      { name: 'Liverpool', badge: 'b.png' }
    );

    expect(teams).toHaveLength(2);
    expect(teams[0].statistics.map((s: any) => s.label)).toEqual(['Possession', 'Shots', 'Corner Kicks', 'Fouls']);
    expect(teams[0].statistics[0]).toMatchObject({ displayValue: '58.4', percentage: 58 });
    expect(teams[1].statistics[0]).toMatchObject({ displayValue: '41.6', percentage: 42 });
    expect(teams[0].statistics[1]).toMatchObject({ displayValue: '14', percentage: 70 });
    expect(teams[1].statistics[1]).toMatchObject({ displayValue: '6', percentage: 30 });
  });

  it('returns nothing when the upstream has no boxscore', () => {
    expect(parseEspnBoxscoreTeams(undefined, { name: 'H', badge: '' }, { name: 'A', badge: '' })).toEqual([]);
  });

  it('maps commentary / key events to log rows', () => {
    expect(
      parseEspnCommentary({
        keyEvents: [
          { clock: { displayValue: "20'" }, type: { text: 'Goal' }, text: 'Goal! Arsenal 1, Liverpool 0.' },
          { clock: { displayValue: "40'" }, type: { text: 'Yellow Card' }, text: 'Alexis Mac Allister is booked.' },
        ],
      })
    ).toEqual([
      { type: 'Goal', text: 'Goal! Arsenal 1, Liverpool 0.', time: { displayValue: "20'" } },
      { type: 'Yellow Card', text: 'Alexis Mac Allister is booked.', time: { displayValue: "40'" } },
    ]);

    expect(parseEspnCommentary({})).toEqual([]);
  });
});

describe('stream source enrichment', () => {
  it('attaches catalogue servers that scoreboard providers cannot supply', () => {
    const espnMatch = normalizeEspnEvent(IN_PROGRESS_EVENT)!;
    const catalogue: Match[] = [
      {
        ...espnMatch,
        id: 'wf-1',
        source: 'watchfooty',
        homeTeam: { name: 'Arsenal FC', badge: '' },
        awayTeam: { name: 'Liverpool FC', badge: '' },
        sources: [{ source: 'wf', id: '1', url: 'https://example.com/a.m3u8', label: 'Server 1' }],
      },
      {
        ...espnMatch,
        id: 'wf-2',
        source: 'watchfooty',
        homeTeam: { name: 'Bayern Munich', badge: '' },
        awayTeam: { name: 'Dortmund', badge: '' },
        sources: [],
      },
    ];

    const [merged] = attachStreamSources([espnMatch], catalogue);
    expect(merged.sources).toHaveLength(1);
    expect(merged.sources[0].url).toBe('https://example.com/a.m3u8');
    expect(merged.source).toBe('espn');
    expect(merged.status).toBe('live');
  });

  it('leaves ESPN matches untouched when nothing matches', () => {
    const espnMatch = normalizeEspnEvent(SCHEDULED_EVENT)!;
    const [untouched] = attachStreamSources([espnMatch], []);
    expect(untouched.sources).toEqual([]);
  });
});

describe('stats endpoint guards', () => {
  it('does not touch the network for non-ESPN ids', async () => {
    await expect(getEspnMatchStats('wf-123')).resolves.toBeNull();
    await expect(getEspnMatchStats('espn-nope')).resolves.toBeNull();
  });
});
