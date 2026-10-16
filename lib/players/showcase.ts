/**
 * Current market-value snapshot + selected honors for the stars fans look up.
 *
 * Values are the **Transfermarkt market values of the 2026-10-09 update** — the
 * same ranking published worldwide — with the exact date kept on every record so
 * the card can never present a stale number as today's price. Provider data
 * always wins: these snapshots only fill a gap (or an older date) and are
 * explicitly labelled as dated estimates, never as transfer fees.
 *
 * Honors are selected, dated and sourced; they are not a complete career tally.
 */
import type { PlayerHonor, PlayerProfile } from './types';

const team = (id: string, name: string, years: string[], source: string): PlayerHonor => ({ id, name, years, category: 'team', source });
const individual = (id: string, name: string, years: string[], source: string): PlayerHonor => ({ id, name, years, category: 'individual', source });

/** Date the snapshot below reflects (Transfermarkt's October 2026 update). */
export const MARKET_VALUE_AS_OF = '2026-10-09';
/** Public ranking page the values come from. */
export const MARKET_VALUE_SOURCE = 'https://www.transfermarkt.com/spieler-statistik/wertvollstespieler/marktwertetop';
const YAMAL = 'https://players.fcbarcelona.com/en/player/2958-lamine-yamal-lamine-yamal';
const PEDRI = 'https://www.fcbarcelona.com/en/football/first-team/players/70486/pedri';
const UEFA = 'https://www.uefa.com/uefaeuro/history/seasons/2024/';
const BALLON = 'https://www.premierleague.com/en/news/4159844';
const CITY = 'https://www.mancity.com/players/erling-haaland';
const REAL = 'https://www.realmadrid.com/en/football/players';
const BAYERN = 'https://fcbayern.com/en/teams/professionals';
const ARSENAL = 'https://www.arsenal.com/men/players';

export interface MarketSnapshot {
  names: string[];
  birth: string;
  /** Transfermarkt market value in EUR (omitted when no current figure is sourced). */
  value?: number;
  honors?: PlayerHonor[];
}

/** Top of the global ranking (€ millions, 2026-10-09 update). */
export const MARKET_SNAPSHOTS: MarketSnapshot[] = [
  {
    names: ['lamine yamal', 'lamine yamal nasraoui ebana'], birth: '2007-07-13', value: 220_000_000,
    honors: [
      team('world-cup', 'World Cup', ['2026'], 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026'),
      team('euro', 'European Championship', ['2024'], UEFA),
      individual('golden-boy', 'Golden Boy', ['2024'], 'https://www.fcbarcelona.com/en/club/news/4177236/fc-barcelona-shines-in-golden-boy-2024'),
      team('la-liga', 'La Liga', ['2022–23'], YAMAL),
    ],
  },
  {
    names: ['erling haaland', 'erling braut haaland'], birth: '2000-07-21', value: 220_000_000,
    honors: [
      individual('pl-golden-boot', 'Premier League Golden Boot', ['2022–23', '2023–24'], CITY),
      team('champions-league', 'Champions League', ['2022–23'], CITY),
      team('premier-league', 'Premier League', ['2020–21', '2021–22', '2022–23', '2023–24'], CITY),
    ],
  },
  {
    names: ['kylian mbappe', 'kylian mbappe lottin'], birth: '1998-12-20', value: 200_000_000,
    honors: [
      team('world-cup', 'World Cup', ['2018'], REAL),
      team('nations-league', 'UEFA Nations League', ['2021'], UEFA),
      team('ligue-1', 'Ligue 1', ['2016–17', '2017–18', '2018–19', '2019–20', '2021–22', '2022–23'], REAL),
    ],
  },
  {
    names: ['michael olise'], birth: '2001-12-12', value: 180_000_000,
    honors: [
      team('bundesliga', 'Bundesliga', ['2024–25'], BAYERN),
      team('dfb-pokal', 'DFB-Pokal', ['2024–25'], BAYERN),
      team('dfb-supercup', 'DFB-Supercup', ['2025'], BAYERN),
    ],
  },
  {
    names: ['jude bellingham', 'jude victor william bellingham'], birth: '2003-06-29', value: 160_000_000,
    honors: [
      team('champions-league', 'Champions League', ['2023–24'], REAL),
      team('la-liga', 'La Liga', ['2023–24', '2024–25'], REAL),
      individual('kopa', 'Kopa Trophy', ['2023'], REAL),
    ],
  },
  {
    names: ['pedri', 'pedro gonzalez lopez'], birth: '2002-11-25', value: 150_000_000,
    honors: [
      individual('golden-boy', 'Golden Boy', ['2021'], PEDRI),
      individual('kopa', 'Kopa Trophy', ['2021'], PEDRI),
      team('euro', 'European Championship', ['2024'], UEFA),
      team('la-liga', 'La Liga', ['2022–23'], PEDRI),
      team('copa-del-rey', 'Copa del Rey', ['2020–21'], PEDRI),
    ],
  },
  {
    names: ['vinicius junior', 'vinicius jose paixao de oliveira junior'], birth: '2000-07-12', value: 130_000_000,
    honors: [
      team('champions-league', 'Champions League', ['2021–22', '2023–24'], REAL),
      team('la-liga', 'La Liga', ['2019–20', '2021–22', '2023–24'], REAL),
    ],
  },
  {
    names: ['pau cubarsi', 'pau cubarsi paredes'], birth: '2007-01-22', value: 100_000_000,
    honors: [
      team('la-liga', 'La Liga', ['2024–25'], 'https://www.fcbarcelona.com/en/football/first-team/players'),
      team('supercopa', 'Supercopa de España', ['2025'], 'https://www.fcbarcelona.com/en/football/first-team/players'),
    ],
  },
  {
    names: ['desire doue'], birth: '2005-06-03', value: 120_000_000,
    honors: [
      team('champions-league', 'Champions League', ['2024–25'], 'https://en.psg.fr/teams/first-team'),
      team('ligue-1', 'Ligue 1', ['2024–25'], 'https://en.psg.fr/teams/first-team'),
    ],
  },
  {
    names: ['bukayo saka'], birth: '2001-09-05', value: 110_000_000,
    honors: [
      individual('england-poty', 'England Player of the Year', ['2021–22', '2022–23'], ARSENAL),
      team('fa-community-shield', 'FA Community Shield', ['2023'], ARSENAL),
    ],
  },
  {
    names: ['rodri', 'rodrigo hernandez', 'rodrigo hernandez cascante'], birth: '1996-06-22',
    honors: [
      individual('ballon-dor', 'Ballon d’Or', ['2024'], BALLON),
      team('champions-league', 'Champions League', ['2022–23'], CITY),
      team('premier-league', 'Premier League', ['2020–21', '2021–22', '2022–23', '2023–24'], BALLON),
      team('euro', 'European Championship', ['2024'], UEFA),
    ],
  },
];

const fold = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function snapshotFor(player: PlayerProfile): MarketSnapshot | null {
  return MARKET_SNAPSHOTS.find((entry) => entry.names.includes(fold(player.name)) && player.dateOfBirth?.startsWith(entry.birth)) ?? null;
}

/**
 * Applies the current market snapshot: a sourced value dated 2026-10-09 plus
 * selected honors. A provider value that is already newer (or honours the
 * provider itself reported) is never overwritten.
 */
export function withShowcaseSnapshot(player: PlayerProfile): PlayerProfile {
  const snapshot = snapshotFor(player);
  if (!snapshot) return player;
  const providerIsNewer = Boolean(player.marketValue && Date.parse(player.marketValue.asOf) >= Date.parse(MARKET_VALUE_AS_OF));
  const marketValue = providerIsNewer || !snapshot.value
    ? player.marketValue
    : { amount: snapshot.value, currency: 'EUR', asOf: MARKET_VALUE_AS_OF, source: MARKET_VALUE_SOURCE };
  const featured = Boolean(snapshot.value && marketValue);
  return {
    ...player,
    featured: player.featured ?? featured,
    ...(marketValue ? { marketValue } : {}),
    honors: player.honors.length ? player.honors : snapshot.honors || [],
    honorsNote: player.honors.length ? 'Honors reported by the data provider.' : 'Selected honors — not a complete or live career tally.',
  };
}
