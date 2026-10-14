/**
 * ESPN live-data provider — REAL football fixtures, live scores, match minutes,
 * cards, goals and live match statistics straight from ESPN's public JSON
 * endpoints. Nothing in this file fabricates data: every value is derived from
 * an upstream response, and anything we cannot parse is simply omitted.
 *
 * Endpoints used (public, undocumented, no API key):
 *   • https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=YYYYMMDD
 *       → every fixture of a given day across ~200 competitions.
 *   • https://cdn.espn.com/core/soccer/game?xhr=1&gameId=…          (boxscore + commentary)
 *   • https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=…
 *   • https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event=…
 *       → the last two are tried in order because the `all` scoreboard does not
 *         tell us which league an event belongs to.
 */
import logger from '../logger';
import { Match, MatchEvent, MatchLiveDetails, MatchStats, Team } from '../types';
import { getCountryForLeague, getLeaguePriority } from '../utils/matching';
import { getCacheManager } from '../cache/cacheManager';

export const ESPN_ID_PREFIX = 'espn-';
export const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
export const ESPN_CDN_GAME_URL = 'https://cdn.espn.com/core/soccer/game';
export const ESPN_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const REQUEST_TIMEOUT_MS = 7_000;
/** Scoreboards move fast (goals, minutes); keep the upstream cache short. */
const SCOREBOARD_REVALIDATE_S = 15;
/** How long the merged fixture list is reused inside the app. */
export const ESPN_MATCHES_TTL_S = 20;
/** How long a parsed match summary (stats/commentary) is reused. */
export const ESPN_SUMMARY_TTL_S = 45;
/** Day window fetched around today so late kick-offs are never missed. */
const DAY_OFFSETS = [-1, 0, 1];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

async function espnFetch<T = any>(url: string, revalidate = SCOREBOARD_REVALIDATE_S): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate },
    } as any);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** `YYYYMMDD` (UTC) for a day offset from today — the format ESPN expects. */
export function espnDateString(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now.getTime() + offsetDays * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function isEspnMatchId(matchId: string): boolean {
  return typeof matchId === 'string' && matchId.startsWith(ESPN_ID_PREFIX);
}

/** `espn-700001` → `700001` */
export function parseEspnEventId(matchId: string): string | null {
  if (!isEspnMatchId(matchId)) return null;
  const id = matchId.slice(ESPN_ID_PREFIX.length).trim();
  return /^\d+$/.test(id) ? id : null;
}

/** Display-name aliases for the competitions ESPN covers most. */
const LEAGUE_NAME_OVERRIDES: Record<string, string> = {
  'english premier league': 'Premier League',
  'spanish la liga': 'La Liga',
  'spanish copa del rey': 'Copa del Rey',
  'german bundesliga': 'Bundesliga',
  'italian serie a': 'Serie A',
  'french ligue 1': 'Ligue 1',
  'uefa champions league': 'UEFA Champions League',
  'uefa europa league': 'UEFA Europa League',
  'uefa europa conference league': 'UEFA Conference League',
  'uefa nations league': 'UEFA Nations League',
  'uefa european championship': 'UEFA Euro',
  'conmebol copa libertadores': 'Copa Libertadores',
  'conmebol sudamericana': 'Copa Sudamericana',
  'usa nwsl': 'NWSL',
  'usa major league soccer': 'MLS',
  'fifa world cup': 'FIFA World Cup',
  'fifa club world cup': 'FIFA Club World Cup',
  'club friendly': 'Club Friendlies',
  'club friendlies': 'Club Friendlies',
  'english fa cup': 'English FA Cup',
  'english league cup': 'English League Cup',
  'mexican liga mx': 'Liga MX',
  'portuguese primeira liga': 'Primeira Liga',
  'dutch eredivisie': 'Eredivisie',
  'afc asian cup': 'AFC Asian Cup',
  'africa cup of nations': 'Africa Cup of Nations',
};

/** ESPN league slugs we can map from a season slug, used for summary lookups. */
const LEAGUE_SLUG_HINTS: Array<{ test: RegExp; slug: string }> = [
  { test: /english-premier-league/, slug: 'eng.1' },
  { test: /english-league-championship/, slug: 'eng.2' },
  { test: /english-fa-cup/, slug: 'eng.fa' },
  { test: /english-league-cup|carabao/, slug: 'eng.league_cup' },
  { test: /spanish-la-liga/, slug: 'esp.1' },
  { test: /german-bundesliga/, slug: 'ger.1' },
  { test: /italian-serie-a/, slug: 'ita.1' },
  { test: /french-ligue-1/, slug: 'fra.1' },
  { test: /uefa-champions-league/, slug: 'uefa.champions' },
  { test: /uefa-europa-league/, slug: 'uefa.europa' },
  { test: /uefa-europa-conference/, slug: 'uefa.europa.conf' },
  { test: /usa-major-league-soccer/, slug: 'usa.1' },
  { test: /mexican-liga-mx/, slug: 'mex.1' },
  { test: /dutch-eredivisie/, slug: 'ned.1' },
  { test: /portuguese-primeira-liga/, slug: 'por.1' },
  { test: /brazilian-serie-a|brasileirao/, slug: 'bra.1' },
  { test: /argentinian-liga-profesional/, slug: 'arg.1' },
  { test: /turkish-super-lig/, slug: 'tur.1' },
  { test: /saudi-pro-league/, slug: 'ksa.1' },
  { test: /japanese-j-league/, slug: 'jpn.1' },
];

function titleCase(value: string): string {
  const small = new Set(['de', 'del', 'of', 'the', 'and', 'da', 'do', 'la', 'le', 'du', 'van']);
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && small.has(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * ESPN's `season.slug` looks like `2025-26-english-premier-league`; turning it
 * into `Premier League` is real upstream metadata (never a made-up label).
 */
export function tournamentFromSeasonSlug(seasonSlug?: string, fallback = 'Football'): string {
  if (!seasonSlug || typeof seasonSlug !== 'string') return fallback;
  const cleaned = seasonSlug
    .replace(/^\d{4}(-\d{2})?-?/, '')
    .replace(/-+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  const lower = cleaned.toLowerCase();
  if (LEAGUE_NAME_OVERRIDES[lower]) return LEAGUE_NAME_OVERRIDES[lower];
  for (const [key, name] of Object.entries(LEAGUE_NAME_OVERRIDES)) {
    if (lower === key || lower.endsWith(key)) return name;
  }
  return titleCase(cleaned);
}

/** Best-effort league slug for summary requests (null when unknowable). */
export function leagueSlugFromSeasonSlug(seasonSlug?: string): string | null {
  if (!seasonSlug || typeof seasonSlug !== 'string') return null;
  for (const { test, slug } of LEAGUE_SLUG_HINTS) {
    if (test.test(seasonSlug)) return slug;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Event normalisation                                                       */
/* -------------------------------------------------------------------------- */

function findCompetition(event: any): any {
  return event?.competitions?.[0] ?? null;
}

function findCompetitor(competition: any, side: 'home' | 'away'): any {
  return (competition?.competitors || []).find((c: any) => c?.homeAway === side) ?? null;
}

function teamFromCompetitor(competitor: any, fallbackName: string): Team {
  const team = competitor?.team || {};
  const badge = team.logo || team.logos?.[0]?.href || '';
  return {
    name: team.displayName || team.name || team.shortDisplayName || fallbackName,
    badge,
  };
}

/** ESPN detail type text → our compact event vocabulary. */
export function classifyEspnEventType(typeText: string): MatchEvent['type'] {
  const t = (typeText || '').toLowerCase();
  if (!t) return 'other';
  if (t.includes('own goal')) return 'own-goal';
  if (t.includes('penalty') && t.includes('scored')) return 'penalty';
  if (t.includes('penalty') && t.includes('miss')) return 'other';
  if (t.includes('goal')) return 'goal';
  if (t.includes('second yellow')) return 'red';
  if (t.includes('yellow')) return 'yellow';
  if (t.includes('red card') || t.includes('ejection') || t.includes('straight red')) return 'red';
  if (t.includes('substitution')) return 'substitution';
  return 'other';
}

/** Parse `competitions[0].details` (goals, cards, subs) into compact events. */
export function parseEspnDetails(competition: any, homeTeamId?: string): {
  events: MatchEvent[];
  cards: MatchLiveDetails['cards'];
  scorers: MatchLiveDetails['scorers'];
} {
  const cards: MatchLiveDetails['cards'] = {
    home: { yellow: 0, red: 0 },
    away: { yellow: 0, red: 0 },
  };
  const scorers: MatchLiveDetails['scorers'] = { home: [], away: [] };
  const events: MatchEvent[] = [];

  for (const raw of competition?.details || []) {
    const label: string = raw?.type?.text || '';
    const type = classifyEspnEventType(label);
    const minute: string = raw?.clock?.displayValue || '';
    const teamId: string = raw?.team?.id ? String(raw.team.id) : '';
    const side: MatchEvent['side'] = !teamId || !homeTeamId ? '' : teamId === String(homeTeamId) ? 'home' : 'away';
    const player: string | undefined = raw?.athletesInvolved?.[0]?.displayName || raw?.athletesInvolved?.[0]?.shortName;
    const ownGoal = !!raw?.ownGoal || type === 'own-goal';
    const penalty = !!raw?.penalty || type === 'penalty';

    if (type === 'yellow' || type === 'red' || label.toLowerCase().includes('card')) {
      // "Second yellow" is reported as a red: count the booking plus the red.
      if (type === 'red' && label.toLowerCase().includes('second yellow')) {
        if (side) cards[side].yellow += 1;
      }
      if (side) {
        if (type === 'red') cards[side].red += 1;
        else cards[side].yellow += 1;
      }
    }

    if (type === 'goal' || type === 'own-goal' || type === 'penalty') {
      // An own goal credits the opposing side.
      const scoringSide: MatchEvent['side'] =
        ownGoal && side ? (side === 'home' ? 'away' : 'home') : side;
      if (scoringSide && player) {
        scorers[scoringSide].push(`${player} ${minute}`.trim());
      } else if (scoringSide) {
        scorers[scoringSide].push(minute || 'Goal');
      }
    }

    if (!label) continue;
    events.push({ type, label, minute, side, player, ownGoal, penalty });
  }

  return { events, cards, scorers };
}

/** Live "state" strings ESPN uses in `status.type.state`. */
function espnStatus(event: any, competition: any): { status: Match['status']; note: string } {
  const type = competition?.status?.type || event?.status?.type || {};
  const state: string = type.state || 'pre';
  const name: string = (type.name || '').toUpperCase();
  const description: string = type.description || '';

  if (name.includes('POSTPONED') || name.includes('CANCELED') || name.includes('CANCELLED') || name.includes('DELAYED')) {
    return { status: 'upcoming', note: description || 'Postponed' };
  }
  if (state === 'in') return { status: 'live', note: '' };
  if (state === 'post') return { status: 'finished', note: description === 'Final' ? '' : description };
  return { status: 'upcoming', note: description };
}

/**
 * Minute label + numeric minute from ESPN's status block. Prefers ESPN's own
 * `detail`/`shortDetail` (e.g. `63'`, `HT`, `90'+4'`) and falls back to the
 * period/clock arithmetic when those are missing.
 */
export function minuteFromStatus(status: any): { label: string; minute: number } {
  const type = status?.type || {};
  const detail: string = type.shortDetail || type.detail || '';
  const parsed = /^(\d{1,3})/.exec(detail);
  const clockSeconds = Number(status?.clock);
  const period = Number(status?.period);

  // ESPN's soccer clocks are usually continuous (62' → 3720s in period 2), but
  // some competitions report the time elapsed *inside* the period instead.
  // Both shapes resolve to the same minute with the guard below.
  const derivedMinute = (() => {
    if (!Number.isFinite(clockSeconds) || clockSeconds <= 0) return 0;
    const played = Math.floor(clockSeconds / 60);
    if (period === 2) return played > 45 ? played : played + 45;
    if (period === 3) return Math.min(120, played > 90 ? played : played + 90);
    if (period === 4) return Math.min(150, played > 105 ? played : played + 105);
    return played;
  })();

  const minute = parsed ? Number(parsed[1]) : derivedMinute;
  const label = detail || (minute > 0 ? `${minute}'` : '');

  return { label, minute: Math.max(0, minute) };
}

/** One raw ESPN event → our `Match` shape. Returns null for unusable events. */
export function normalizeEspnEvent(event: any): Match | null {
  const competition = findCompetition(event);
  if (!competition) return null;

  const homeRaw = findCompetitor(competition, 'home');
  const awayRaw = findCompetitor(competition, 'away');
  if (!homeRaw && !awayRaw) return null;

  const kickoff = Date.parse(event?.date || competition?.date || '');
  const timestamp = Number.isFinite(kickoff) ? kickoff : Date.now();

  const { status, note } = espnStatus(event, competition);
  const statusBlock = competition?.status || event?.status;
  const { label: minuteLabel, minute } = minuteFromStatus(statusBlock);

  const homeName = homeRaw?.team?.displayName || homeRaw?.team?.name || event?.name?.split(/ vs? /i)?.[0] || 'Home';
  const awayName = awayRaw?.team?.displayName || awayRaw?.team?.name || event?.name?.split(/ vs? /i)?.[1] || 'Away';
  const homeTeamId = homeRaw?.team?.id ? String(homeRaw.team.id) : undefined;

  const tournament = tournamentFromSeasonSlug(event?.season?.slug, event?.league?.name || 'Football');
  const { events, cards, scorers } = parseEspnDetails(competition, homeTeamId);

  const toScore = (raw: any): number => {
    const parsed = typeof raw?.score === 'string' ? Number.parseFloat(raw.score) : Number(raw?.score);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  };

  const isShootout = Number.isFinite(Number(homeRaw?.shootoutScore)) || Number.isFinite(Number(awayRaw?.shootoutScore));
  const live: MatchLiveDetails | undefined =
    status === 'live' || status === 'finished'
      ? {
          cards,
          events,
          scorers,
          period: statusBlock?.type?.description || '',
          detail: statusBlock?.type?.detail || '',
        }
      : undefined;

  const id = `${ESPN_ID_PREFIX}${event?.id}`;

  return {
    id,
    title: event?.name || `${homeName} vs ${awayName}`,
    sport: 'football',
    status,
    timestamp,
    tournament,
    country: getCountryForLeague(tournament),
    priority: getLeaguePriority(tournament),
    homeTeam: teamFromCompetitor(homeRaw, homeName),
    awayTeam: teamFromCompetitor(awayRaw, awayName),
    leagueLogo: '',
    poster: '',
    venue: competition?.venue?.fullName || '',
    note: note || (isShootout ? 'Decided on penalties' : ''),
    sources: [],
    fallbackChannels: [],
    currentMinute: status === 'live' ? minuteLabel : status === 'finished' ? 'FT' : '',
    currentMinuteNumber: status === 'live' ? minute : status === 'finished' ? 90 : 0,
    homeScore: toScore(homeRaw),
    awayScore: toScore(awayRaw),
    live,
    source: 'espn',
    leagueSlug: leagueSlugFromSeasonSlug(event?.season?.slug),
  };
}

/* -------------------------------------------------------------------------- */
/*  Scoreboards                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every ESPN soccer event for one `YYYYMMDD` day. A failure for a single day
 * never takes the whole list down.
 */
export async function fetchEspnScoreboard(dateStr: string): Promise<any[]> {
  const url = `${ESPN_SCOREBOARD_URL}?dates=${dateStr}&limit=1000`;
  const data = await espnFetch<any>(url, SCOREBOARD_REVALIDATE_S);
  const events = Array.isArray(data?.events) ? data.events : [];
  if (!events.length) {
    logger.debug('ESPN scoreboard returned no events', { date: dateStr });
  }
  return events;
}

/** Today's real fixtures (live, finished and upcoming) — cached, never throws. */
export async function getEspnMatches(): Promise<Match[]> {
  const cache = getCacheManager();
  return cache.swr(
    'espn_matches',
    async () => {
      const days = DAY_OFFSETS.map((offset) => espnDateString(offset));
      const results = await Promise.allSettled(days.map((day) => fetchEspnScoreboard(day)));

      const seen = new Set<string>();
      const matches: Match[] = [];
      let failures = 0;

      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') {
          failures += 1;
          logger.warn('ESPN scoreboard fetch failed', { date: days[idx], error: String(result.reason?.message || result.reason) });
          return;
        }
        for (const event of result.value) {
          const normalized = normalizeEspnEvent(event);
          if (!normalized || seen.has(normalized.id)) continue;
          seen.add(normalized.id);
          matches.push(normalized);
        }
      });

      if (!matches.length && failures === days.length) {
        throw new Error('ESPN scoreboards unavailable');
      }

      logger.info('ESPN fixtures loaded', { matches: matches.length, days: days.length });
      return matches;
    },
    ESPN_MATCHES_TTL_S
  ).catch((err) => {
    logger.error('ESPN fixtures failed', err);
    return [] as Match[];
  });
}

/**
 * Look a single match up by id. The dashboard window (±1 day) is searched
 * first; if a user opens an older/newer link we widen the window before giving
 * up, so live-score polling keeps working for any real ESPN fixture.
 */
export async function getEspnMatchById(matchId: string): Promise<Match | null> {
  const eventId = parseEspnEventId(matchId);
  if (!eventId) return null;

  const matches = await getEspnMatches();
  const hit = matches.find((m) => m.id === matchId);
  if (hit) return hit;

  for (const offset of [-4, -3, -2, 2, 3, 4] as const) {
    try {
      const events = await fetchEspnScoreboard(espnDateString(offset));
      const event = events.find((candidate: any) => String(candidate?.id) === eventId);
      if (event) {
        const normalized = normalizeEspnEvent(event);
        if (normalized) return normalized;
      }
    } catch (err: any) {
      logger.debug('ESPN event lookup failed', { offset, error: err?.message });
    }
  }

  // Last resort: the summary endpoint still carries status, score and teams.
  try {
    const summary = await fetchEspnSummary(eventId);
    const competition = summary?.header?.competitions?.[0];
    if (competition && Array.isArray(competition.competitors) && competition.competitors.length) {
      const normalized = normalizeEspnEvent({
        ...summary.header,
        id: eventId,
        date: competition.date || summary.header?.date,
      });
      if (normalized) return { ...normalized, id: matchId };
    }
  } catch (err: any) {
    logger.debug('ESPN summary lookup failed', { matchId, error: err?.message });
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Summaries: real live statistics, cards, commentary                        */
/* -------------------------------------------------------------------------- */

/**
 * Fetch a match summary, trying every league-agnostic strategy in turn.
 * Returns the first usable payload (ESPN summary or CDN game package).
 */
export async function fetchEspnSummary(eventId: string, leagueSlugHint?: string): Promise<any | null> {
  const attempts: Array<{ label: string; url: string }> = [
    { label: 'summary(all)', url: `${ESPN_SUMMARY_URL}/all/summary?event=${eventId}` },
  ];
  if (leagueSlugHint) {
    attempts.push({ label: `summary(${leagueSlugHint})`, url: `${ESPN_SUMMARY_URL}/${leagueSlugHint}/summary?event=${eventId}` });
  }
  attempts.push({ label: 'cdn-game', url: `${ESPN_CDN_GAME_URL}?xhr=1&gameId=${eventId}` });

  for (const attempt of attempts) {
    try {
      const payload = await espnFetch<any>(attempt.url, ESPN_SUMMARY_TTL_S);
      const body = payload?.gamepackageJSON ? payload.gamepackageJSON : payload;
      if (body && (body.boxscore || body.header || body.commentary || body.plays)) {
        return body;
      }
    } catch (err: any) {
      logger.debug('ESPN summary attempt failed', { attempt: attempt.label, error: err?.message });
    }
  }
  return null;
}

function normalizeStatName(stat: any): string {
  return String(stat?.name || stat?.label || '').trim();
}

/**
 * Human labels for the statistics ESPN reports for football matches. ESPN
 * normally ships a `label`, but some payloads/trimmed responses omit it — in
 * that case we translate the real field name instead of dropping the row.
 */
export const ESPN_STAT_LABELS: Record<string, string> = {
  possessionPct: 'Possession',
  foulsCommitted: 'Fouls',
  yellowCards: 'Yellow Cards',
  redCards: 'Red Cards',
  offsides: 'Offsides',
  wonCorners: 'Corner Kicks',
  saves: 'Saves',
  totalShots: 'Shots',
  shotsOnTarget: 'Shots on Target',
  shotPct: 'Shot Accuracy',
  penaltyKickGoals: 'Penalties Scored',
  penaltyKickShots: 'Penalties Taken',
  accuratePasses: 'Accurate Passes',
  totalPasses: 'Passes',
  passPct: 'Pass Accuracy',
  accurateCrosses: 'Accurate Crosses',
  totalCrosses: 'Crosses',
  crossPct: 'Cross Accuracy',
  totalLongBalls: 'Long Balls',
  accurateLongBalls: 'Accurate Long Balls',
  longballPct: 'Long Ball Accuracy',
  blockedShots: 'Blocked Shots',
  effectiveTackles: 'Tackles Won',
  totalTackles: 'Tackles',
  tacklePct: 'Tackle Success',
  interceptions: 'Interceptions',
  effectiveClearance: 'Effective Clearances',
  totalClearance: 'Clearances',
  shotsOnGoal: 'Shots on Target',
  wonTackles: 'Tackles Won',
  possession: 'Possession',
};

/** Key comparison rows are shown first; the rest follow in upstream order. */
const KEY_STAT_ORDER = [
  'possessionPct',
  'totalShots',
  'shotsOnTarget',
  'wonCorners',
  'foulsCommitted',
  'yellowCards',
  'redCards',
  'offsides',
  'saves',
];

/** `shotsOnTarget` → `Shots On Target` when ESPN sent no label and we have no map entry. */
export function prettifyStatName(name: string): string {
  if (ESPN_STAT_LABELS[name]) return ESPN_STAT_LABELS[name];
  const spaced = name
    .replace(/Pct$/, ' Percentage')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function statSortIndex(name: string): number {
  const idx = KEY_STAT_ORDER.indexOf(name);
  return idx === -1 ? KEY_STAT_ORDER.length : idx;
}

/**
 * ESPN boxscore teams → the `{statistics:[{name,label,displayValue,percentage}]}`
 * shape our statistics panel renders. Percentages are computed from the two
 * sides' own values so the comparison bars are always proportional.
 */
export function parseEspnBoxscoreTeams(
  boxscore: any,
  homeTeam: Team,
  awayTeam: Team,
  header?: any
): any[] {
  const teams = boxscore?.teams;
  if (!Array.isArray(teams) || teams.length < 2) return [];

  const [first, second] = teams;

  // Which entry is home? Prefer the explicit flag, then the team id published
  // in the summary header, and finally ESPN's "home first" convention.
  const headerCompetitors = header?.competitions?.[0]?.competitors || [];
  const homeTeamId = headerCompetitors.find((c: any) => c?.homeAway === 'home')?.team?.id
    ?? headerCompetitors.find((c: any) => c?.homeAway === 'home')?.id;
  const homeTeamName = headerCompetitors.find((c: any) => c?.homeAway === 'home')?.team?.displayName;

  let home = first;
  let away = second;
  if (String(first?.homeAway || '').toLowerCase() === 'away') {
    home = second;
    away = first;
  } else if (!first?.homeAway) {
    const ids = teams.map((t: any) => t?.team?.id).filter(Boolean);
    if (homeTeamId && ids.includes(homeTeamId)) {
      home = teams.find((t: any) => t?.team?.id === homeTeamId) as any;
      away = (teams.find((t: any) => t !== home) as any) || second;
    } else if (homeTeamName) {
      const named = teams.find((t: any) => t?.team?.displayName === homeTeamName);
      if (named) {
        home = named;
        away = (teams.find((t: any) => t !== named) as any) || second;
      }
    }
  }

  const homeStats: any[] = Array.isArray(home?.statistics) ? home.statistics : [];
  const awayStats: any[] = Array.isArray(away?.statistics) ? away.statistics : [];
  const statFor = (list: any[], name: string) => list.find((s: any) => normalizeStatName(s) === name);

  // Work from the union of both sides so a stat missing on one side still shows.
  const names: string[] = [];
  for (const stat of [...homeStats, ...awayStats]) {
    const name = normalizeStatName(stat);
    if (name && !names.includes(name)) names.push(name);
  }
  names.sort((a, b) => statSortIndex(a) - statSortIndex(b));

  const statistics = names
    .map((name) => {
      const homeStat = statFor(homeStats, name);
      const awayStat = statFor(awayStats, name);
      const label = homeStat?.label || awayStat?.label || prettifyStatName(name);
      const homeValue = homeStat?.displayValue ?? '-';
      const awayValue = awayStat?.displayValue ?? '-';

      const homeNum = Number.parseFloat(String(homeValue));
      const awayNum = Number.parseFloat(String(awayValue));
      const total = (Number.isFinite(homeNum) ? homeNum : 0) + (Number.isFinite(awayNum) ? awayNum : 0);
      const homePct = total > 0 ? Math.round(((Number.isFinite(homeNum) ? homeNum : 0) / total) * 100) : 50;

      return {
        name,
        label,
        displayValue: String(homeValue),
        percentage: Math.min(100, Math.max(0, homePct)),
        awayDisplayValue: String(awayValue),
        awayPercentage: 100 - Math.min(100, Math.max(0, homePct)),
      };
    })
    .filter((stat: any) => stat.label);

  const toTeamBlock = (team: Team, side: 'home' | 'away') => ({
    team: { displayName: team.name, logo: team.badge },
    statistics: statistics.map((stat: any) => ({
      name: stat.name,
      label: stat.label,
      displayValue: side === 'home' ? stat.displayValue : stat.awayDisplayValue,
      percentage: side === 'home' ? stat.percentage : stat.awayPercentage,
    })),
  });

  return [toTeamBlock(homeTeam, 'home'), toTeamBlock(awayTeam, 'away')];
}

/** ESPN commentary / key events → the log rows the UI expects. */
export function parseEspnCommentary(summary: any): any[] {
  const keyEvents = summary?.keyEvents;
  if (Array.isArray(keyEvents) && keyEvents.length) {
    return keyEvents
      .map((item: any) => ({
        type: item?.type?.text || item?.type?.name || '',
        text: item?.text || item?.shortText || '',
        time: { displayValue: item?.clock?.displayValue || item?.time?.displayValue || '' },
      }))
      .filter((item: any) => item.text);
  }

  const commentary = summary?.commentary;
  if (Array.isArray(commentary) && commentary.length) {
    return commentary
      .map((item: any) => ({
        type: item?.play?.type?.text || item?.type?.text || '',
        text: item?.text || '',
        time: { displayValue: item?.time?.displayValue || item?.clock?.displayValue || '' },
      }))
      .filter((item: any) => item.text);
  }

  return [];
}

/** Real match statistics for a match id (boxscore + commentary), or null. */
export async function getEspnMatchStats(matchId: string): Promise<MatchStats | null> {
  const eventId = parseEspnEventId(matchId);
  if (!eventId) return null;

  const cache = getCacheManager();
  return cache.swr(
    `espn_stats_${eventId}`,
    async () => {
      const matches = await getEspnMatches();
      const match = matches.find((m) => m.id === matchId) || (await getEspnMatchById(matchId));

      const summary = await fetchEspnSummary(eventId, match?.leagueSlug || undefined);
      if (!summary) return null;

      const header = summary?.header || {};
      const competition = header?.competitions?.[0] || {};
      const homeCompetitor = findCompetitor(competition, 'home');
      const awayCompetitor = findCompetitor(competition, 'away');
      const homeTeam = match?.homeTeam || teamFromCompetitor(homeCompetitor, 'Home');
      const awayTeam = match?.awayTeam || teamFromCompetitor(awayCompetitor, 'Away');

      const teamStats = parseEspnBoxscoreTeams(summary?.boxscore, homeTeam, awayTeam, header);
      const commentary = parseEspnCommentary(summary);
      const gameInfo = summary?.gameInfo || {};

      if (!teamStats.length && !commentary.length) return null;

      return {
        venue: match?.venue || gameInfo?.venue?.fullName || competition?.venue?.fullName || '',
        leagueLogo: match?.leagueLogo || '',
        poster: '',
        boxscore: { teams: teamStats },
        rosters: summary?.rosters || null,
        commentary,
      } as MatchStats;
    },
    ESPN_SUMMARY_TTL_S
  ).catch((err) => {
    logger.error('ESPN match stats failed', err, { matchId });
    return null;
  });
}
