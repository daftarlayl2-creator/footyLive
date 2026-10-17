import { Match, Channel } from '../types';
import { StreamProvider } from './types';
import { fetchWithTimeout } from './baseProvider';
import { getLeaguePriority, getCountryForLeague } from '../utils/matching';
import logger from '../logger';

const WATCHFOOTY_API = process.env.NEXT_PUBLIC_API_BASE || 'https://api.watchfooty.st';
const TIMEOUT_MS = 4000;
const SHORT_TIMEOUT = 2500;

export class WatchFootyProvider implements StreamProvider {
  id = 'watchfooty';
  name = 'WatchFooty';

  private wfMatchesCache: any[] = [];
  private wfMatchFetchInFlight: Promise<any[]> | null = null;

  private async fetchRawMatches(): Promise<any[]> {
    if (this.wfMatchFetchInFlight) return this.wfMatchFetchInFlight;
    this.wfMatchFetchInFlight = (async () => {
      try {
        const data = await fetchWithTimeout(`${WATCHFOOTY_API}/api/v1/matches/football`, TIMEOUT_MS);
        this.wfMatchesCache = Array.isArray(data) ? data : [];
        return this.wfMatchesCache;
      } catch (err: any) {
        logger.error('WatchFooty API request failed', err, { api: WATCHFOOTY_API });
        this.wfMatchesCache = [];
        return this.wfMatchesCache;
      } finally {
        this.wfMatchFetchInFlight = null;
      }
    })();
    return this.wfMatchFetchInFlight;
  }

  async fetchMatches(): Promise<Match[]> {
    const raw = await this.fetchRawMatches();
    return raw.map(normalizeWatchFootyMatch);
  }

  async resolveStreams(
    matchTitle: string,
    homeTeam: string,
    awayTeam: string,
    matchId: string,
    preFetchedMatch?: Match | null
  ): Promise<Channel[]> {
    const match = preFetchedMatch || await getMatchDetails(matchId);
    if (!match || !match.sources) return [];
    
    return match.sources.map((s, idx) => ({
      name: `Server ${idx + 1}`,
      url: s.url,
      provider: this.id,
      quality: s.quality ? String(s.quality).toUpperCase() : 'SD',
    }));
  }
}

/** Epoch values below this are seconds; at/above it they are milliseconds. */
const EPOCH_MS_THRESHOLD = 100_000_000_000; // 1e11 ms ≈ 1973, 1e11 s ≈ year 5138
const MIN_PLAUSIBLE_MS = Date.UTC(2000, 0, 1);
const MAX_PLAUSIBLE_MS = Date.UTC(2100, 0, 1);

/**
 * Normalise an upstream kick-off time to epoch **milliseconds** with an
 * explicit unit decision, or 0 when the value cannot be trusted:
 *   - numbers (and all-digit strings) below 1e11 are epoch *seconds*;
 *   - numbers at/above 1e11 are epoch *milliseconds*;
 *   - other strings must parse as a date (ISO etc.);
 *   - results outside 2000–2100 are rejected as unit mix-ups/garbage.
 * Returning 0 (never "now") keeps bad timestamps visible to the shared
 * visibility rules instead of fabricating a kick-off time.
 */
export function parseWatchFootyTimestamp(value: unknown): number {
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value.trim()))) {
    const numeric = typeof value === 'number' ? value : Number(value.trim());
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    ms = numeric < EPOCH_MS_THRESHOLD ? numeric * 1000 : numeric;
  } else if (typeof value === 'string' && value.trim()) {
    ms = Date.parse(value);
  } else {
    return 0;
  }
  return Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS && ms < MAX_PLAUSIBLE_MS ? ms : 0;
}

/** Upstream status strings that authoritatively mean the match has ended. */
const FINISHED_STATUSES = new Set(['post', 'finished', 'ft', 'full-time', 'fulltime', 'full_time', 'completed', 'final']);
/** Upstream status strings that authoritatively mean the match is in play. */
const LIVE_STATUSES = new Set(['in', 'live', 'inprogress', 'in-progress', 'in_progress', 'playing']);
const POSTPONED_STATUSES = new Set(['postponed', 'delayed']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'abandoned']);

/**
 * Status comes only from the upstream status field. Kick-off times, elapsed
 * wall-clock time and structured minutes/scores are never used to promote a
 * match to `live` — a lagging feed stays honestly `upcoming` until the
 * provider itself reports the match in play.
 */
function watchFootyStatus(match: any): { status: Match['status']; note: string } {
  const raw = String(match?.status ?? '').toLowerCase().trim();
  if (FINISHED_STATUSES.has(raw)) return { status: 'finished', note: '' };
  if (LIVE_STATUSES.has(raw)) return { status: 'live', note: '' };
  if (POSTPONED_STATUSES.has(raw)) return { status: 'upcoming', note: 'Postponed' };
  if (CANCELLED_STATUSES.has(raw)) return { status: 'upcoming', note: 'Cancelled' };
  return { status: 'upcoming', note: '' };
}

/** Structured numeric field → a non-negative integer score (0 when unusable). */
function structuredScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function normalizeWatchFootyMatch(match: any): Match {
  const streams = match.streams || [];
  const homeLogo = match.teams?.home?.logoUrl ? match.teams.home.logoUrl : '';
  const awayLogo = match.teams?.away?.logoUrl ? match.teams.away.logoUrl : '';
  const leagueLogo = match.leagueLogo ? match.leagueLogo : '';
  const poster = match.poster ? match.poster : '';

  const kickoffTime = parseWatchFootyTimestamp(match.timestamp);
  const { status, note: statusNote } = watchFootyStatus(match);

  // Minutes pass through only as reported upstream — never derived from
  // the kick-off time or the wall clock.
  const upstreamMinute = Number(match.currentMinuteNumber);
  const currentMinuteNumber = Number.isFinite(upstreamMinute) && upstreamMinute > 0 ? Math.trunc(upstreamMinute) : 0;
  const currentMinute = status === 'finished'
    ? 'FT'
    : typeof match.currentMinute === 'string' ? match.currentMinute : '';

  const country = getCountryForLeague(match.league || '');

  return {
    id: String(match.matchId || ''),
    title: match.title || '',
    sport: 'football',
    status,
    source: 'watchfooty',
    timestamp: kickoffTime,
    tournament: match.league || '',
    country: country,
    priority: getLeaguePriority(match.league || ''),
    homeTeam: { name: match.teams?.home?.name || 'Home', badge: homeLogo },
    awayTeam: { name: match.teams?.away?.name || 'Away', badge: awayLogo },
    leagueLogo: leagueLogo,
    poster: poster,
    venue: match.venue || '',
    note: match.note || statusNote,
    sources: streams.map((s: any, idx: number) => ({ 
      source: `wf-${s.source || 'stream'}-${idx + 1}`,
      id: String(s.id),
      url: s.url,
      label: `Server ${idx + 1}`,
      quality: s.quality ? String(s.quality).toUpperCase() : 'SD'
    })),
    fallbackChannels: streams.map((s: any, idx: number) => ({
      name: `Server ${idx + 1} (WatchFooty)`,
      url: s.url,
    })),
    currentMinute,
    currentMinuteNumber,
    homeScore: structuredScore(match.scores?.home ?? match.homeScore ?? 0),
    awayScore: structuredScore(match.scores?.away ?? match.awayScore ?? 0),
  };

}

export async function getLeagues(): Promise<string[]> {
  try {
    const data = await fetchWithTimeout(`${WATCHFOOTY_API}/api/v1/top-leagues/football`, TIMEOUT_MS);
    return Array.isArray(data) ? data.filter(l => typeof l === 'string').sort() : [];
  } catch (err: any) {
    logger.error('WatchFooty Leagues API request failed', err);
    return [];
  }
}

export async function getMatchDetails(matchId: string): Promise<Match | null> {
  try {
    const data = await fetchWithTimeout(`${WATCHFOOTY_API}/api/v1/match/${matchId}`, TIMEOUT_MS);
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const match = Array.isArray(data) ? data[0] : data;
    return normalizeWatchFootyMatch(match);
  } catch (err: any) {
    logger.error('WatchFooty Match Details API request failed', err, { matchId });
    return null;
  }
}

export interface MatchStats {
  venue: string;
  leagueLogo: string;
  poster: string;
  boxscore: any;
  rosters: any;
  commentary: any;
}

export async function getMatchStats(matchId: string): Promise<MatchStats | null> {
  try {
    const data = await fetchWithTimeout(`${WATCHFOOTY_API}/api/v1/match/${matchId}/stats`, SHORT_TIMEOUT);
    if (!data || !data.statistics) return null;
    return {
      venue: data.venue || '',
      leagueLogo: data.leagueLogo ? data.leagueLogo : '',
      poster: data.poster ? data.poster : '',
      boxscore: data.statistics?.boxscore || null,
      rosters: data.statistics?.rosters || null,
      commentary: data.statistics?.commentary || null,
    };
  } catch (err) {
    return null;
  }
}

export async function getTopTeams(): Promise<string[]> {
  try {
    const data = await fetchWithTimeout(`${WATCHFOOTY_API}/api/v1/top-teams/football`, TIMEOUT_MS);
    return Array.isArray(data) ? data.filter(t => typeof t === 'string') : [];
  } catch (err: any) {
    logger.error('WatchFooty Top Teams API request failed', err);
    return [];
  }
}
