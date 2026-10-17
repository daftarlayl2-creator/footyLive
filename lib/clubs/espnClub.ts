/**
 * Pure normalisers for ESPN's public team endpoints (club pages):
 *
 *   /apis/site/v2/sports/soccer/all/teams/{id}                   → profile
 *   /apis/site/v2/sports/soccer/all/teams/{id}/schedule          → results
 *   /apis/site/v2/sports/soccer/all/teams/{id}/schedule?fixture=true → fixtures
 *   /apis/site/v2/sports/soccer/{league}/teams/{id}/roster       → squad
 *   site.web.api.espn.com/apis/search/v2?type=team&sport=soccer  → name lookup
 *
 * ESPN's roster `coach` field is not used: it is badly stale (it still lists
 * Arsène Wenger for Arsenal); the current manager comes from Wikidata.
 */
import { competitionFromSeasonName } from '@/lib/providers/espn';
import { normalizeHex } from './colors';

export interface ClubRecord {
  played?: number;
  wins: number;
  draws: number;
  losses: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  rank?: number;
}

export interface ClubInfo {
  espnId: string;
  name: string;
  shortName?: string;
  abbreviation?: string;
  nickname?: string;
  location?: string;
  logo?: string;
  logoDark?: string;
  color?: string;
  alternateColor?: string;
  league?: { slug: string; name: string; logo?: string };
  standingSummary?: string;
  record?: ClubRecord | null;
  isNational?: boolean;
}

export interface ClubMatchSide {
  id?: string;
  name: string;
  shortName?: string;
  abbreviation?: string;
  logo?: string;
  score?: number;
  shootout?: number;
  winner?: boolean;
}

export type ClubMatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'canceled';

export interface ClubMatch {
  id: string;
  date: string;
  competition: string;
  status: ClubMatchStatus;
  statusDetail?: string;
  venue?: string;
  city?: string;
  isHome: boolean;
  home: ClubMatchSide;
  away: ClubMatchSide;
  opponent: ClubMatchSide;
  result?: 'W' | 'D' | 'L';
}

export type PositionGroup = 'Goalkeepers' | 'Defenders' | 'Midfielders' | 'Forwards' | 'Squad';

export interface SquadPlayer {
  id: string;
  name: string;
  jersey?: string;
  position: string;
  group: PositionGroup;
  age?: number;
  nationality?: string;
  flag?: string;
  appearances?: number;
  goals?: number;
  assists?: number;
  injured?: boolean;
}

export interface TeamSearchHit {
  espnId: string;
  name: string;
  league?: string;
  leagueSlug?: string;
  logo?: string;
}

const isNumericId = (value: unknown): boolean => value !== undefined && value !== null && /^\d+$/.test(String(value));

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickLogo(logos: any[] | undefined, dark = false): string | undefined {
  if (!Array.isArray(logos)) return undefined;
  const match = logos.find((logo) => {
    const rel: string[] = Array.isArray(logo?.rel) ? logo.rel : [];
    return dark ? rel.includes('dark') : rel.includes('default') && !rel.includes('dark');
  });
  return (match ?? (dark ? undefined : logos[0]))?.href || undefined;
}

function statMap(stats: any[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const stat of Array.isArray(stats) ? stats : []) {
    const value = numberOrUndefined(stat?.value);
    if (stat?.name && value !== undefined) map.set(String(stat.name), value);
  }
  return map;
}

/** `/all/teams/{id}` → club profile (null when ESPN does not know the team). */
export function normalizeEspnTeam(json: any): ClubInfo | null {
  const team = json?.team ?? null;
  if (!team || !isNumericId(team.id)) return null;
  const name = team.displayName || team.name || team.shortDisplayName;
  if (!name) return null;

  const league = team.defaultLeague;
  const recordItem = Array.isArray(team.record?.items)
    ? team.record.items.find((item: any) => item?.type === 'total') ?? team.record.items[0]
    : null;
  const stats = statMap(recordItem?.stats);
  const record: ClubRecord | null = recordItem
    ? {
        played: stats.get('gamesPlayed'),
        wins: stats.get('wins') ?? 0,
        draws: stats.get('ties') ?? 0,
        losses: stats.get('losses') ?? 0,
        points: stats.get('points'),
        goalsFor: stats.get('pointsFor'),
        goalsAgainst: stats.get('pointsAgainst'),
        rank: stats.get('rank'),
      }
    : null;

  const color = normalizeHex(team.color);
  const alternateColor = normalizeHex(team.alternateColor);
  const logo = pickLogo(team.logos);
  const logoDark = pickLogo(team.logos, true);
  const leagueName = league?.name ? competitionFromSeasonName(String(league.name), String(league.name)) : '';

  return {
    espnId: String(team.id),
    name,
    ...(team.shortDisplayName && team.shortDisplayName !== name ? { shortName: team.shortDisplayName } : {}),
    ...(team.abbreviation ? { abbreviation: team.abbreviation } : {}),
    ...(team.nickname && team.nickname !== name ? { nickname: team.nickname } : {}),
    ...(team.location ? { location: team.location } : {}),
    ...(logo ? { logo } : {}),
    ...(logoDark ? { logoDark } : {}),
    ...(color ? { color } : {}),
    ...(alternateColor ? { alternateColor } : {}),
    ...(league?.slug ? { league: { slug: String(league.slug), name: leagueName || String(league.slug), ...(pickLogo(league.logos) ? { logo: pickLogo(league.logos) } : {}) } } : {}),
    ...(team.standingSummary ? { standingSummary: String(team.standingSummary) } : {}),
    record: record && (record.wins || record.draws || record.losses || record.played) ? record : null,
    ...(team.isNational !== undefined ? { isNational: Boolean(team.isNational) } : {}),
  };
}

function scoreOf(competitor: any): number | undefined {
  const raw = competitor?.score;
  if (raw && typeof raw === 'object') return numberOrUndefined(raw.value ?? raw.displayValue);
  return numberOrUndefined(raw);
}

function sideOf(competitor: any): ClubMatchSide {
  const team = competitor?.team ?? {};
  const id = isNumericId(team.id) ? String(team.id) : isNumericId(competitor?.id) ? String(competitor.id) : undefined;
  const score = scoreOf(competitor);
  const shootout = numberOrUndefined(competitor?.shootoutScore ?? competitor?.score?.shootoutScore);
  const logo = pickLogo(team.logos) || team.logo;
  return {
    ...(id ? { id } : {}),
    name: team.displayName || team.name || team.shortDisplayName || 'TBD',
    ...(team.shortDisplayName ? { shortName: team.shortDisplayName } : {}),
    ...(team.abbreviation ? { abbreviation: team.abbreviation } : {}),
    ...(logo ? { logo } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(shootout !== undefined ? { shootout } : {}),
    ...(typeof competitor?.winner === 'boolean' ? { winner: competitor.winner } : {}),
  };
}

function statusOf(competition: any, event: any): { status: ClubMatchStatus; detail?: string } {
  const type = competition?.status?.type ?? event?.status?.type ?? {};
  const name = String(type.name ?? '').toUpperCase();
  const detail = type.shortDetail || type.detail || type.description;
  if (name.includes('POSTPONED') || name.includes('DELAYED')) return { status: 'postponed', detail };
  if (name.includes('CANCELED') || name.includes('CANCELLED') || name.includes('ABANDONED') || name.includes('FORFEIT')) {
    return { status: 'canceled', detail };
  }
  if (type.state === 'post' || type.completed === true) return { status: 'finished', detail };
  if (type.state === 'in') return { status: 'live', detail };
  return { status: 'scheduled', detail };
}

/** Team schedule → matches from the club's perspective (sorted oldest → newest). */
export function normalizeTeamSchedule(json: any, teamId: string): ClubMatch[] {
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  const matches: ClubMatch[] = [];

  for (const event of events) {
    const competition = event?.competitions?.[0];
    const competitors: any[] = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const homeRaw = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
    const awayRaw = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];
    if (!event?.id || !homeRaw || !awayRaw) continue;

    const home = sideOf(homeRaw);
    const away = sideOf(awayRaw);
    const isHome = home.id === String(teamId);
    if (!isHome && away.id !== String(teamId)) continue;

    const { status, detail } = statusOf(competition, event);
    const us = isHome ? home : away;
    const them = isHome ? away : home;

    let result: ClubMatch['result'];
    if (status === 'finished' && us.score !== undefined && them.score !== undefined) {
      if (us.score > them.score) result = 'W';
      else if (us.score < them.score) result = 'L';
      else if (us.shootout !== undefined && them.shootout !== undefined && us.shootout !== them.shootout) {
        result = us.shootout > them.shootout ? 'W' : 'L';
      } else if (us.winner === true && them.winner === false) result = 'W';
      else if (them.winner === true && us.winner === false) result = 'L';
      else result = 'D';
    }

    const date = String(event.date || competition?.date || '');
    if (!date) continue;
    const competitionName =
      competitionFromSeasonName(event?.season?.displayName) ||
      competitionFromSeasonName(event?.league?.name) ||
      event?.league?.abbreviation ||
      'Football';

    matches.push({
      id: String(event.id),
      date,
      competition: competitionName,
      status,
      ...(detail ? { statusDetail: String(detail) } : {}),
      ...(competition?.venue?.fullName ? { venue: String(competition.venue.fullName) } : {}),
      ...(competition?.venue?.address?.city ? { city: String(competition.venue.address.city) } : {}),
      isHome,
      home,
      away,
      opponent: them,
      ...(result ? { result } : {}),
    });
  }

  matches.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return matches;
}

/** Lifecycle stage for club matches (`scheduled/postponed/canceled → live → finished`). */
function clubStageRank(status: ClubMatchStatus): number {
  if (status === 'finished') return 2;
  if (status === 'live') return 1;
  return 0;
}

function hasScores(match: ClubMatch): boolean {
  return match.home.score !== undefined && match.away.score !== undefined;
}

/**
 * Merge the results schedule and the fixtures schedule into one record per
 * match id. Both lists come from the same ESPN endpoints, so conflicts are
 * resolved by lifecycle stage — a `finished` copy always beats a `scheduled`
 * or `live` copy of the same match whatever list it arrived in — then by
 * score completeness. On a full tie the results-list record wins (that
 * endpoint is authoritative for completed matches). Deterministic for any
 * input order of the two lists themselves.
 */
export function mergeClubSchedules(results: ClubMatch[], fixtures: ClubMatch[]): ClubMatch[] {
  const byId = new Map<string, ClubMatch>();
  // Fixtures first, results second: with the tie-break below (incoming
  // results record wins only when it is not strictly worse), the fixtures
  // copy survives only when it is at a strictly later lifecycle stage.
  for (const match of fixtures) byId.set(match.id, match);
  for (const match of results) {
    const existing = byId.get(match.id);
    if (!existing) {
      byId.set(match.id, match);
      continue;
    }
    const stage = clubStageRank(match.status) - clubStageRank(existing.status);
    if (stage > 0) {
      byId.set(match.id, match);
    } else if (stage === 0 && hasScores(match) && !hasScores(existing)) {
      byId.set(match.id, match);
    } else if (stage === 0 && hasScores(match) === hasScores(existing)) {
      byId.set(match.id, match);
    }
    // stage < 0, or same stage with fewer scores: keep the existing record.
  }
  return [...byId.values()];
}

/** Last `count` results, oldest → newest (W/D/L). */
export function formFromResults(matches: ClubMatch[], count = 5): Array<'W' | 'D' | 'L'> {
  return matches
    .filter((m) => m.status === 'finished' && m.result)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(-count)
    .map((m) => m.result as 'W' | 'D' | 'L');
}

/** Most recent home venue, used as a stadium fallback. */
export function homeVenueFrom(matches: ClubMatch[]): string | undefined {
  const home = matches.filter((m) => m.isHome && m.venue).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return home[0]?.venue;
}

const GROUP_ORDER: PositionGroup[] = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards', 'Squad'];

export function positionGroup(position: { name?: string; abbreviation?: string } | null | undefined): PositionGroup {
  const name = String(position?.name ?? '').toLowerCase();
  const abbr = String(position?.abbreviation ?? '').toUpperCase();
  if (name.includes('goal') || abbr === 'G' || abbr === 'GK') return 'Goalkeepers';
  if (name.includes('defen') || name.includes('back') || ['D', 'CB', 'LB', 'RB', 'CD', 'LWB', 'RWB', 'SW'].includes(abbr)) return 'Defenders';
  if (name.includes('midfield') || ['M', 'CM', 'DM', 'AM', 'LM', 'RM', 'CDM', 'CAM'].includes(abbr)) return 'Midfielders';
  if (name.includes('forward') || name.includes('striker') || name.includes('wing') || ['F', 'ST', 'CF', 'LW', 'RW', 'SS'].includes(abbr)) {
    return 'Forwards';
  }
  return 'Squad';
}

function athleteStat(athlete: any, name: string): number | undefined {
  const categories: any[] = athlete?.statistics?.splits?.categories ?? [];
  for (const category of categories) {
    const stat = (category?.stats ?? []).find((s: any) => s?.name === name);
    if (stat) return numberOrUndefined(stat.value);
  }
  return undefined;
}

/** `/teams/{id}/roster` → squad players (flat or position-grouped payloads). */
export function normalizeRoster(json: any): SquadPlayer[] {
  const raw: any[] = Array.isArray(json?.athletes) ? json.athletes : [];
  const athletes = raw.flatMap((entry) => (Array.isArray(entry?.items) ? entry.items : [entry]));
  const players: SquadPlayer[] = [];

  for (const athlete of athletes) {
    const name = athlete?.displayName || athlete?.fullName;
    if (!athlete?.id || !name) continue;
    const appearances = athleteStat(athlete, 'appearances');
    const goals = athleteStat(athlete, 'totalGoals');
    const assists = athleteStat(athlete, 'goalAssists');
    const age = numberOrUndefined(athlete.age);
    players.push({
      id: String(athlete.id),
      name,
      ...(athlete.jersey ? { jersey: String(athlete.jersey) } : {}),
      position: athlete.position?.displayName || athlete.position?.name || 'Player',
      group: positionGroup(athlete.position),
      ...(age !== undefined ? { age } : {}),
      ...(athlete.citizenship ? { nationality: String(athlete.citizenship) } : {}),
      ...(athlete.flag?.href ? { flag: String(athlete.flag.href) } : {}),
      ...(appearances !== undefined ? { appearances } : {}),
      ...(goals !== undefined ? { goals } : {}),
      ...(assists !== undefined ? { assists } : {}),
      ...(Array.isArray(athlete.injuries) && athlete.injuries.length ? { injured: true } : {}),
    });
  }
  return players;
}

/** Squad grouped by line, each sorted by shirt number then name. */
export function groupSquad(players: SquadPlayer[]): Array<{ group: PositionGroup; players: SquadPlayer[] }> {
  const byGroup = new Map<PositionGroup, SquadPlayer[]>();
  for (const player of players) {
    const list = byGroup.get(player.group) ?? [];
    list.push(player);
    byGroup.set(player.group, list);
  }
  const jersey = (p: SquadPlayer) => (p.jersey && /^\d+$/.test(p.jersey) ? Number(p.jersey) : 999);
  return GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
    group,
    players: byGroup.get(group)!.sort((a, b) => jersey(a) - jersey(b) || a.name.localeCompare(b.name)),
  }));
}

const NON_SENIOR = /\b(women|womens|femenino|feminine|féminin|ladies|u-?\d{2}|under[- ]\d{2}|youth|academy|reserves?|castilla|ii|b team)\b/i;
const NON_SENIOR_LEAGUE = /\b(liga f|wsl|nwsl|women|femenin|féminin|frauen|u-?\d{2}|youth|intercontinental cup u)\b/i;

function fold(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** ESPN search → best senior-team match for a club name (null when none). */
export function pickEspnTeamSearchHit(json: any, query: string): TeamSearchHit | null {
  const groups: any[] = Array.isArray(json?.results) ? json.results : [];
  const contents = groups.filter((g) => g?.type === 'team').flatMap((g) => (Array.isArray(g?.contents) ? g.contents : []));
  const wanted = fold(query);
  let best: { hit: TeamSearchHit; score: number } | null = null;

  contents.forEach((content: any, index: number) => {
    if (content?.sport && content.sport !== 'soccer') return;
    const espnId = /~t:(\d+)/.exec(String(content?.uid ?? ''))?.[1];
    const name = String(content?.displayName ?? '');
    if (!espnId || !name) return;

    const folded = fold(name);
    let score = 40 - index;
    if (folded === wanted) score += 100;
    else if (folded.startsWith(wanted) || wanted.startsWith(folded)) score += 40;
    else if (folded.includes(wanted) || wanted.includes(folded)) score += 20;
    if (NON_SENIOR.test(name) && !NON_SENIOR.test(query)) score -= 80;
    if (NON_SENIOR_LEAGUE.test(String(content?.subtitle ?? '')) && !NON_SENIOR.test(query)) score -= 80;

    const hit: TeamSearchHit = {
      espnId,
      name,
      ...(content.subtitle ? { league: String(content.subtitle) } : {}),
      ...(content.defaultLeagueSlug ? { leagueSlug: String(content.defaultLeagueSlug) } : {}),
      ...(content.image?.default ? { logo: String(content.image.default) } : {}),
    };
    if (!best || score > best.score) best = { hit, score };
  });

  const winner = best as { hit: TeamSearchHit; score: number } | null;
  return winner && winner.score > 0 ? winner.hit : null;
}
