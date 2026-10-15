export interface PlayerHonor {
  id: string;
  name: string;
  category: 'individual' | 'team';
  years: string[];
  /** Optional provider/source link, never an inferred trophy count. */
  source?: string;
}

export interface MarketValue {
  amount: number;
  currency: string;
  asOf: string;
  source?: string;
}

export interface SeasonPerformance {
  label: string;
  scope?: string;
  /** False when only historical statistics are available. */
  current: boolean;
  appearances?: number;
  goals?: number;
  assists?: number;
  minutes?: number;
  passAccuracy?: number;
}

/** One portrait candidate; the banner falls through them on image errors. */
export interface PlayerPortrait {
  src: string;
  /** `cutout`/`headshot` are transparent PNGs; `photo` has its own background. */
  kind: 'cutout' | 'headshot' | 'photo';
  credit: 'ESPN' | 'TheSportsDB';
}

export interface PlayerProfile {
  id: string;
  name: string;
  fullName?: string;
  /** ESPN headshot from the athlete payload, when published. */
  portrait?: string;
  /** Ordered portrait candidates (see lib/players/portraits.ts). */
  portraits?: PlayerPortrait[];
  /** A showcase player with a dated editorial snapshot. */
  featured?: boolean;
  dateOfBirth?: string;
  age?: number;
  position: string;
  jersey?: string;
  nationality?: string;
  flag?: string;
  club?: { id?: string; name: string; logo?: string; league?: string };
  marketValue?: MarketValue;
  season: SeasonPerformance;
  honors: PlayerHonor[];
  /** Selected, dated snapshots are not presented as a complete career tally. */
  honorsNote?: string;
  updatedAt: number;
}
