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

/* ========================================================================== */
/*  Official league tables & player leaders (ESPN / TheSportsDB)              */
/* ========================================================================== */

export type StandingsProvider = 'espn' | 'thesportsdb';

export interface StandingsLeague {
  /** ESPN league slug (also our URL key). */
  slug: string;
  name: string;
  shortName: string;
  country: string;
  provider: StandingsProvider;
  /** TheSportsDB league id, for leagues ESPN does not carry. */
  sportsDbId?: string;
  /** Whether a top scorers / assists feed exists for this league. */
  leaders: boolean;
}

/** League selector order (most-followed first; Botola Pro for our Moroccan audience). */
export const STANDINGS_LEAGUES: StandingsLeague[] = [
  { slug: 'eng.1', name: 'Premier League', shortName: 'Premier League', country: 'England', provider: 'espn', leaders: true },
  { slug: 'esp.1', name: 'La Liga', shortName: 'La Liga', country: 'Spain', provider: 'espn', leaders: true },
  { slug: 'ita.1', name: 'Serie A', shortName: 'Serie A', country: 'Italy', provider: 'espn', leaders: true },
  { slug: 'ger.1', name: 'Bundesliga', shortName: 'Bundesliga', country: 'Germany', provider: 'espn', leaders: true },
  { slug: 'fra.1', name: 'Ligue 1', shortName: 'Ligue 1', country: 'France', provider: 'espn', leaders: true },
  { slug: 'uefa.champions', name: 'UEFA Champions League', shortName: 'Champions League', country: 'Europe', provider: 'espn', leaders: true },
  { slug: 'mar.1', name: 'Botola Pro', shortName: 'Botola Pro', country: 'Morocco', provider: 'thesportsdb', sportsDbId: '4520', leaders: false },
  { slug: 'uefa.europa', name: 'UEFA Europa League', shortName: 'Europa League', country: 'Europe', provider: 'espn', leaders: true },
  { slug: 'ned.1', name: 'Eredivisie', shortName: 'Eredivisie', country: 'Netherlands', provider: 'espn', leaders: true },
  { slug: 'por.1', name: 'Primeira Liga', shortName: 'Primeira Liga', country: 'Portugal', provider: 'espn', leaders: true },
  { slug: 'ksa.1', name: 'Saudi Pro League', shortName: 'Saudi Pro League', country: 'Saudi Arabia', provider: 'espn', leaders: true },
  { slug: 'usa.1', name: 'MLS', shortName: 'MLS', country: 'USA', provider: 'espn', leaders: true },
];

export const DEFAULT_STANDINGS_LEAGUE = 'eng.1';

export function findStandingsLeague(slug?: string | null): StandingsLeague | null {
  if (!slug) return null;
  const key = String(slug).trim().toLowerCase();
  return STANDINGS_LEAGUES.find((league) => league.slug === key) ?? null;
}

export interface StandingTeam {
  /** ESPN team id (absent for TheSportsDB rows). */
  id?: string;
  name: string;
  shortName?: string;
  abbreviation?: string;
  logo?: string;
}

export interface StandingZone {
  color: string;
  label: string;
}

export interface StandingRow {
  position: number;
  team: StandingTeam;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Recent form, oldest → newest, e.g. "WDLWW" (when the source provides it). */
  form?: string;
  zone?: StandingZone | null;
}

export interface StandingsGroup {
  name: string | null;
  rows: StandingRow[];
}

export interface LeaderRow {
  rank: number;
  player: { id?: string; name: string; shortName?: string; jersey?: string };
  team: StandingTeam;
  /** Goals for the scorers list, assists for the assists list. */
  value: number;
  appearances?: number;
  goals?: number;
  assists?: number;
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statByName(stats: any[] | undefined, ...names: string[]): number | undefined {
  if (!Array.isArray(stats)) return undefined;
  for (const name of names) {
    const stat = stats.find((s) => s?.name === name);
    if (stat) return optionalNum(stat.value ?? stat.displayValue);
  }
  return undefined;
}

function espnTeam(team: any): StandingTeam | null {
  if (!team) return null;
  const name = team.displayName || team.name || team.shortDisplayName;
  if (!name) return null;
  const logo = team.logos?.find?.((l: any) => Array.isArray(l?.rel) && l.rel.includes('default'))?.href || team.logos?.[0]?.href || team.logo;
  return {
    ...(team.id !== undefined && /^\d+$/.test(String(team.id)) ? { id: String(team.id) } : {}),
    name,
    ...(team.shortDisplayName ? { shortName: team.shortDisplayName } : {}),
    ...(team.abbreviation ? { abbreviation: team.abbreviation } : {}),
    ...(logo ? { logo } : {}),
  };
}

/** Points ↓, goal difference ↓, goals for ↓, then name — used when no rank is published. */
function compareRows(a: StandingRow, b: StandingRow): number {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name);
}

/**
 * ESPN `/apis/v2/sports/soccer/{league}/standings` → groups of rows.
 * Entries are NOT guaranteed to be in table order (e.g. MLS conferences), so
 * rows are sorted by ESPN's published `rank` stat, falling back to points.
 */
export function normalizeEspnStandings(json: any): { season: string | null; groups: StandingsGroup[] } {
  const containers: any[] = Array.isArray(json?.children) && json.children.length ? json.children : json?.standings ? [json] : [];
  let season: string | null = null;
  const groups: StandingsGroup[] = [];

  for (const container of containers) {
    const standings = container?.standings;
    const entries: any[] = Array.isArray(standings?.entries) ? standings.entries : [];
    if (!season && typeof standings?.seasonDisplayName === 'string') {
      season = standings.seasonDisplayName.match(/^\d{4}(?:[-/]\d{2,4})?/)?.[0] ?? null;
    }

    const rows: Array<StandingRow & { rank?: number }> = [];
    for (const entry of entries) {
      const team = espnTeam(entry?.team);
      if (!team) continue;
      const stats = entry?.stats;
      const goalsFor = num(statByName(stats, 'pointsFor'));
      const goalsAgainst = num(statByName(stats, 'pointsAgainst'));
      const zone =
        entry?.note?.description && entry?.note?.color
          ? { color: String(entry.note.color), label: String(entry.note.description) }
          : null;
      rows.push({
        position: 0,
        rank: statByName(stats, 'rank'),
        team,
        played: num(statByName(stats, 'gamesPlayed')),
        won: num(statByName(stats, 'wins')),
        drawn: num(statByName(stats, 'ties')),
        lost: num(statByName(stats, 'losses')),
        goalsFor,
        goalsAgainst,
        goalDifference: statByName(stats, 'pointDifferential') ?? goalsFor - goalsAgainst,
        points: num(statByName(stats, 'points')),
        zone,
      });
    }

    const allRanked = rows.length > 0 && rows.every((row) => typeof row.rank === 'number' && row.rank > 0);
    rows.sort((a, b) => (allRanked ? (a.rank as number) - (b.rank as number) || compareRows(a, b) : compareRows(a, b)));
    const finalRows: StandingRow[] = rows.map(({ rank, ...row }, index) => ({
      ...row,
      position: allRanked ? (rank as number) : index + 1,
    }));

    if (finalRows.length) {
      const groupName = containers.length > 1 ? container?.name || container?.abbreviation || null : null;
      groups.push({ name: groupName, rows: finalRows });
    }
  }

  return { season, groups };
}

function parseShortLeaderLine(text: unknown): { appearances?: number; goals?: number; assists?: number } {
  // ESPN: "M: 6, G: 3: A: 4"
  const value = String(text ?? '');
  const pick = (label: string) => optionalNum(new RegExp(`${label}:\\s*(\\d+)`).exec(value)?.[1]);
  return { appearances: pick('M'), goals: pick('G'), assists: pick('A') };
}

/**
 * ESPN `/apis/site/v2/sports/soccer/{league}/statistics` → ranked leaders.
 * Ties share a rank (1, 2, 2, 4 …).
 */
export function normalizeEspnLeaders(json: any, category: 'goals' | 'assists', limit = 25): LeaderRow[] {
  const stats: any[] = Array.isArray(json?.stats) ? json.stats : [];
  const wanted = category === 'goals' ? 'goalsLeaders' : 'assistsLeaders';
  const block =
    stats.find((s) => s?.name === wanted) ??
    stats.find((s) =>
      category === 'assists'
        ? /assist/i.test(String(s?.name ?? s?.displayName ?? ''))
        : /goal/i.test(String(s?.name ?? s?.displayName ?? '')) && !/assist|against/i.test(String(s?.name ?? ''))
    );
  const leaders: any[] = Array.isArray(block?.leaders) ? block.leaders : [];

  const rows: LeaderRow[] = [];
  for (const leader of leaders) {
    const athlete = leader?.athlete;
    const name = athlete?.displayName || athlete?.fullName || athlete?.shortName;
    if (!name) continue;
    const value = optionalNum(leader?.value ?? leader?.displayValue);
    if (value === undefined) continue;
    const team = espnTeam(athlete?.team ?? leader?.team) ?? { name: '' };
    const fromLine = parseShortLeaderLine(leader?.shortDisplayValue);
    const appearances = statByName(athlete?.statistics, 'appearances') ?? fromLine.appearances;
    const goals = statByName(athlete?.statistics, 'totalGoals') ?? fromLine.goals;
    const assists = statByName(athlete?.statistics, 'goalAssists') ?? fromLine.assists;
    rows.push({
      rank: 0,
      player: {
        ...(athlete?.id !== undefined ? { id: String(athlete.id) } : {}),
        name,
        ...(athlete?.shortName ? { shortName: athlete.shortName } : {}),
        ...(athlete?.jersey ? { jersey: String(athlete.jersey) } : {}),
      },
      team,
      value,
      ...(appearances !== undefined ? { appearances } : {}),
      ...(goals !== undefined ? { goals } : {}),
      ...(assists !== undefined ? { assists } : {}),
    });
  }

  rows.sort((a, b) => b.value - a.value);
  rows.forEach((row, index) => {
    row.rank = index > 0 && rows[index - 1].value === row.value ? rows[index - 1].rank : index + 1;
  });
  return rows.slice(0, limit);
}

function sportsDbZoneColor(label: string): string {
  const text = label.toLowerCase();
  if (text.includes('relegation')) return '#ef4444';
  if (text.includes('champions league')) return '#22c55e';
  if (text.includes('confederation') || text.includes('europa') || text.includes('conference')) return '#38bdf8';
  if (text.includes('play')) return '#f59e0b';
  return '#a1a1aa';
}

/** TheSportsDB `lookuptable.php` → one group (badges upgraded from /tiny to /small). */
export function normalizeSportsDbTable(json: any): StandingsGroup[] {
  const table: any[] = Array.isArray(json?.table) ? json.table : [];
  const rows: StandingRow[] = [];
  for (const entry of table) {
    const name = String(entry?.strTeam ?? '').trim();
    if (!name) continue;
    const goalsFor = num(entry.intGoalsFor);
    const goalsAgainst = num(entry.intGoalsAgainst);
    const label = String(entry.strDescription ?? '').trim();
    const logo = typeof entry.strBadge === 'string' && entry.strBadge ? entry.strBadge.replace(/\/tiny$/, '/small') : undefined;
    const form = typeof entry.strForm === 'string' && /^[WDL]+$/i.test(entry.strForm) ? entry.strForm.toUpperCase() : undefined;
    rows.push({
      position: num(entry.intRank) || rows.length + 1,
      team: { name, ...(logo ? { logo } : {}) },
      played: num(entry.intPlayed),
      won: num(entry.intWin),
      drawn: num(entry.intDraw),
      lost: num(entry.intLoss),
      goalsFor,
      goalsAgainst,
      goalDifference: optionalNum(entry.intGoalDifference) ?? goalsFor - goalsAgainst,
      points: num(entry.intPoints),
      ...(form ? { form } : {}),
      zone: label ? { color: sportsDbZoneColor(label), label } : null,
    });
  }
  rows.sort((a, b) => a.position - b.position);
  return rows.length ? [{ name: null, rows }] : [];
}

/** Distinct qualification / relegation zones across groups, for the table legend. */
export function standingsLegend(groups: StandingsGroup[]): StandingZone[] {
  const seen = new Map<string, StandingZone>();
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.zone && !seen.has(row.zone.label)) seen.set(row.zone.label, row.zone);
    }
  }
  return Array.from(seen.values());
}

/** European-style football season label for a date, e.g. "2026-2027" from Aug 2026. */
export function seasonLabelFor(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
