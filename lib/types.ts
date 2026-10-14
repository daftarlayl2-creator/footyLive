export interface Team {
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

export interface Match {
  id: string;
  title: string;
  sport: string;
  status: 'live' | 'upcoming';
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
