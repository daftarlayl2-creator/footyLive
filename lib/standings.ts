export const LEAGUES_TO_SHOW = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'UEFA Champions League',
  'Botola Pro',
] as const;

export const SEEDED_LEAGUE_CLUBS: Record<string, string[]> = {
  'Premier League': [
    'Liverpool',
    'Arsenal',
    'Manchester City',
    'Chelsea',
    'Aston Villa',
    'Newcastle United',
    'Tottenham Hotspur',
    'Manchester United',
  ],
  'La Liga': [
    'Barcelona',
    'Real Madrid',
    'Atlético Madrid',
    'Athletic Club',
    'Villarreal',
    'Real Betis',
    'Real Sociedad',
    'Sevilla',
  ],
  'Serie A': [
    'Napoli',
    'Inter',
    'Atalanta',
    'Juventus',
    'AC Milan',
    'Lazio',
    'Fiorentina',
    'Roma',
  ],
  'Bundesliga': [
    'Bayern Munich',
    'Bayer Leverkusen',
    'RB Leipzig',
    'Borussia Dortmund',
    'Eintracht Frankfurt',
    'VfB Stuttgart',
    'SC Freiburg',
    'VfL Wolfsburg',
  ],
  'Ligue 1': [
    'Paris Saint-Germain',
    'AS Monaco',
    'Olympique Marseille',
    'Lille',
    'Lyon',
    'Nice',
    'RC Lens',
    'Stade Rennais',
  ],
  'UEFA Champions League': [
    'Liverpool',
    'Barcelona',
    'Arsenal',
    'Inter',
    'Real Madrid',
    'Bayern Munich',
    'Paris Saint-Germain',
    'Borussia Dortmund',
  ],
  'Botola Pro': [
    'RS Berkane',
    'AS FAR',
    'Wydad AC',
    'Raja CA',
    'FUS Rabat',
    'Maghreb de Fès',
    'Olympic Safi',
    'Hassania Agadir',
  ],
};

export interface TeamStandingRow {
  position: number;
  name: string;
  badge: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface LeagueTable {
  league: string;
  matchesPlayed: number;
  standings: TeamStandingRow[];
}

export interface TopScorerRow {
  rank: number;
  name: string;
  team: string;
  goals: number;
}

function unwrapMatches(input: any): any[] {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.matches)) return input.matches;
  return [];
}

function ensureTeam(
  teamMap: Map<string, Omit<TeamStandingRow, 'position'>>,
  rawName?: string,
  rawBadge?: string
): Omit<TeamStandingRow, 'position'> | null {
  const name = String(rawName || '').trim();
  if (!name) return null;
  const existing = teamMap.get(name);
  if (existing) {
    if (!existing.badge && rawBadge) existing.badge = rawBadge;
    return existing;
  }
  const entry: Omit<TeamStandingRow, 'position'> = {
    name,
    badge: rawBadge || '',
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
  teamMap.set(name, entry);
  return entry;
}

/**
 * Compute per-team league tables from match fixtures and results.
 * Seeds known leagues with real club names so tables never fall back to
 * synthetic "Team 1..20" placeholders even before today's kick-offs.
 */
export function computeLeagueTables(matchesInput: any): LeagueTable[] {
  const matches = unwrapMatches(matchesInput);

  const leagueTeams = new Map<string, Map<string, Omit<TeamStandingRow, 'position'>>>();
  const leagueMatchesPlayed = new Map<string, number>();

  for (const league of LEAGUES_TO_SHOW) {
    const map = new Map<string, Omit<TeamStandingRow, 'position'>>();
    for (const club of SEEDED_LEAGUE_CLUBS[league] || []) {
      ensureTeam(map, club);
    }
    leagueTeams.set(league, map);
    leagueMatchesPlayed.set(league, 0);
  }

  for (const m of matches) {
    if (!m || typeof m !== 'object') continue;
    const tournament = String(m.tournament || 'General').trim() || 'General';
    if (!leagueTeams.has(tournament)) {
      leagueTeams.set(tournament, new Map());
      leagueMatchesPlayed.set(tournament, 0);
    }

    const teamMap = leagueTeams.get(tournament)!;
    const homeName = m.homeTeam?.name || m.homeName;
    const awayName = m.awayTeam?.name || m.awayName;
    const home = ensureTeam(teamMap, homeName, m.homeTeam?.badge || m.homeBadge);
    const away = ensureTeam(teamMap, awayName, m.awayTeam?.badge || m.awayBadge);
    if (!home || !away) continue;

    const hasResult =
      m.status === 'live' ||
      m.status === 'finished' ||
      (m.status !== 'upcoming' && (typeof m.homeScore === 'number' || typeof m.awayScore === 'number'));

    if (!hasResult) continue;

    const homeScore = Math.max(0, Number(m.homeScore ?? 0) || 0);
    const awayScore = Math.max(0, Number(m.awayScore ?? 0) || 0);

    leagueMatchesPlayed.set(tournament, (leagueMatchesPlayed.get(tournament) || 0) + 1);

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (awayScore > homeScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  const orderedLeagues: string[] = [...LEAGUES_TO_SHOW];
  for (const [league, map] of leagueTeams.entries()) {
    if (!orderedLeagues.includes(league) && map.size > 0) {
      orderedLeagues.push(league);
    }
  }

  return orderedLeagues
    .filter((league) => (leagueTeams.get(league)?.size || 0) > 0)
    .map((league) => {
      const teamMap = leagueTeams.get(league)!;
      const rows = Array.from(teamMap.values()).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        if (b.played !== a.played) return b.played - a.played;
        return a.name.localeCompare(b.name);
      });

      return {
        league,
        matchesPlayed: leagueMatchesPlayed.get(league) || 0,
        standings: rows.map((row, idx) => ({
          ...row,
          position: idx + 1,
        })),
      };
    });
}

/**
 * Extract clean player name and goal count from an upstream scorer string
 * such as `"Bukayo Saka 20'"` or `"Mohamed Salah 45'+2'"`.
 */
export function parseScorerEntry(raw: unknown): { name: string; count: number } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const minuteMatches = trimmed.match(/\b\d{1,3}'(?:\+\d{1,2}'?)?/g);
  const cleaned = trimmed
    .replace(/\((?:pen|og|p|o\.g\.)\)/gi, '')
    .replace(/\b\d{1,3}'(?:\+\d{1,2}'?)?/g, '')
    .replace(/[·,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /^goal$/i.test(cleaned)) return null;
  return {
    name: cleaned,
    count: minuteMatches && minuteMatches.length > 0 ? minuteMatches.length : 1,
  };
}

/** Compute top scorers from match data, preserving each scorer's team name. */
export function computeTopScorers(matchesInput: any): TopScorerRow[] {
  const matches = unwrapMatches(matchesInput);
  const scorerMap = new Map<string, { name: string; team: string; goals: number }>();

  const recordSide = (entries: unknown[], teamName: string) => {
    for (const raw of entries) {
      const parsed = parseScorerEntry(raw);
      if (!parsed) continue;
      const key = parsed.name.toLowerCase();
      const existing = scorerMap.get(key);
      if (existing) {
        existing.goals += parsed.count;
        if (existing.team === 'Unknown' && teamName) existing.team = teamName;
      } else {
        scorerMap.set(key, {
          name: parsed.name,
          team: teamName || 'Unknown',
          goals: parsed.count,
        });
      }
    }
  };

  for (const m of matches) {
    if (!m || typeof m !== 'object') continue;
    const homeTeamName = m.homeTeam?.name || m.homeName || 'Unknown';
    const awayTeamName = m.awayTeam?.name || m.awayName || 'Unknown';
    const homeScorers = m.live?.scorers?.home || m.scorers?.home || [];
    const awayScorers = m.live?.scorers?.away || m.scorers?.away || [];

    if (Array.isArray(homeScorers)) recordSide(homeScorers, homeTeamName);
    if (Array.isArray(awayScorers)) recordSide(awayScorers, awayTeamName);
  }

  return Array.from(scorerMap.values())
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));
}
