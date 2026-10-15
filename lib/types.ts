export interface Team {
  /** Upstream (ESPN) team id when known — used for /club/{id} links. */
  id?: string;
  name: string;
  badge: string;
}

export interface StreamSource {
  source: string;
  id: string;
  url: string;
  label: string;
  quality?: string;
}

export interface Channel {
  name: string;
  url: string;
  proxiedUrl?: string;
  provider?: string;
  quality?: string;
  /** How the player loads `proxiedUrl`: hls.js, a plain media file, or an iframe. */
  kind?: 'hls' | 'mp4' | 'embed';
}

/** Where a fixture came from — used to decide whether a status is authoritative. */
export type MatchSource = 'espn' | 'watchfooty' | 'unknown';

/** `finished` = the upstream feed reported a full-time / completed match. */
export type MatchStatus = 'live' | 'upcoming' | 'finished';

/** One goal / card / substitution, as reported by the upstream live feed. */
export interface MatchEvent {
  type: 'goal' | 'own-goal' | 'penalty' | 'yellow' | 'red' | 'substitution' | 'other';
  /** Raw upstream label, e.g. "Yellow Card". */
  label: string;
  /** Minute as displayed upstream, e.g. "63'". */
  minute: string;
  side: 'home' | 'away' | '';
  player?: string;
  ownGoal?: boolean;
  penalty?: boolean;
}

/** Real-time extras available for live (and recently finished) matches. */
export interface MatchLiveDetails {
  cards: {
    home: { yellow: number; red: number };
    away: { yellow: number; red: number };
  };
  events: MatchEvent[];
  /** Goal scorers per side formatted as "Player 63'". */
  scorers: { home: string[]; away: string[] };
  period?: string;
  detail?: string;
}

export interface Match {
  id: string;
  title: string;
  sport: string;
  status: MatchStatus;
  /** Upstream that supplied the fixture. */
  source?: MatchSource;
  /** Live cards / goals / scorers parsed from the upstream scoreboard. */
  live?: MatchLiveDetails;
  /** Upstream league slug (ESPN, e.g. `eng.1`) when it is known. */
  leagueSlug?: string | null;
  timestamp: number;
  tournament: string;
  country: string;
  priority: number;
  homeTeam: Team;
  awayTeam: Team;
  leagueLogo: string;
  poster: string;
  venue: string;
  note: string;
  sources: StreamSource[];
  fallbackChannels: { name: string; url: string }[];
  /** Number of feed servers shown on a live ESPN card when the catalogue has none. */
  feedStreamCount?: number;
  /** These are other live channels, NOT a verified stream of this fixture. */
  feedStreamIsFallback?: boolean;
  currentMinute: string;
  currentMinuteNumber: number;
  homeScore: number;
  awayScore: number;
}

export interface MatchStats {
  venue: string;
  leagueLogo: string;
  poster: string;
  boxscore: any;
  rosters: any;
  commentary: any;
}
