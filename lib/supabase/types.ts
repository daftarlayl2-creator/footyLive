/**
 * Supabase table schemas for Limon Live.
 * 
 * Define the shape of data stored in each Supabase table.
 * These types are used for type-safe inserts/queries.
 */

// match_messages: Real-time persistent match chat
export interface MatchMessage {
  id: string;
  match_id: string;
  username: string;
  avatar: string;
  message: string;
  created_at: string;
}

// match_predictions: Fan predictions & voting bar
export interface MatchPrediction {
  id: string;
  match_id: string;
  username: string;
  prediction: 'home' | 'draw' | 'away';
  created_at: string;
}

// custom_streams: Admin-added M3U stream URLs
export interface CustomStream {
  id: string;
  match_title: string;
  kickoff_time: string;
  m3u8_url: string;
  created_at: string;
  created_by: string;
}

// custom_channels: Admin-managed channels
export interface CustomChannel {
  id: string;
  name: string;
  logo: string;
  m3u_url: string;
  is_active: boolean;
  created_at: string;
}

// match_stats: Team lineups & league standings data
export interface LineupPlayer {
  shirtNumber: number;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  playerName: string;
}

export interface TeamFormation {
  formation: string; // e.g. '4-3-3', '4-4-2'
  lineup: LineupPlayer[];
}

// league_table: League standings
export interface LeagueTableEntry {
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

// top_scorers: Top goalscorers
export interface TopScorer {
  rank: number;
  playerName: string;
  team: string;
  goals: number;
}