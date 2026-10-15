/**
 * Small, explicitly dated editorial snapshots for the showcase examples.
 * They are selected honors, NOT complete/live trophy totals. Provider data
 * takes precedence. Market estimates retain their historical valuation date.
 */
import type { PlayerHonor, PlayerProfile } from './types';

const team = (id: string, name: string, years: string[], source: string): PlayerHonor => ({ id, name, years, category: 'team', source });
const individual = (id: string, name: string, years: string[], source: string): PlayerHonor => ({ id, name, years, category: 'individual', source });
const UEFA = 'https://www.uefa.com/uefaeuro/history/seasons/2024/';
const YAMAL = 'https://players.fcbarcelona.com/en/player/2958-lamine-yamal-lamine-yamal';
const PEDRI = 'https://www.fcbarcelona.com/en/football/first-team/players/70486/pedri';
const VALUES = 'https://www.laliga.com/en-US/news/lamine-yamal-becomes-the-most-valuable-spanish-footballer-ever';
const RODRI = 'https://www.mancity.com/news/mens/rodri-leaves-manchester-city-to-join-barcelona-63922660';
const BALLON = 'https://www.premierleague.com/en/news/4159844';

const SNAPSHOTS = [
  {
    names: ['lamine yamal', 'lamine yamal nasraoui ebana'], birth: '2007-07-13',
    value: 150_000_000, source: VALUES,
    honors: [
      individual('golden-boy', 'Golden Boy', ['2024'], 'https://www.fcbarcelona.com/en/club/news/4177236/fc-barcelona-shines-in-golden-boy-2024'),
      team('euro', 'European Championship', ['2024'], UEFA),
      team('la-liga', 'La Liga', ['2022–23'], YAMAL),
    ],
  },
  {
    names: ['pedri', 'pedro gonzalez lopez'], birth: '2002-11-25',
    value: 80_000_000, source: VALUES,
    honors: [
      individual('golden-boy', 'Golden Boy', ['2021'], PEDRI),
      individual('kopa', 'Kopa Trophy', ['2021'], PEDRI),
      team('la-liga', 'La Liga', ['2022–23'], PEDRI),
      team('copa-del-rey', 'Copa del Rey', ['2020–21'], PEDRI),
    ],
  },
  {
    names: ['rodri', 'rodrigo hernandez', 'rodrigo hernandez cascante'], birth: '1996-06-22',
    value: 130_000_000, source: VALUES,
    honors: [
      individual('ballon-dor', 'Ballon d’Or', ['2024'], BALLON),
      team('champions-league', 'Champions League', ['2022–23'], RODRI),
      team('premier-league', 'Premier League', ['2020–21', '2021–22', '2022–23', '2023–24'], RODRI),
      team('euro', 'European Championship', ['2024'], UEFA),
    ],
  },
];

export function withShowcaseSnapshot(player: PlayerProfile): PlayerProfile {
  const fold = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const snapshot = SNAPSHOTS.find((entry) => entry.names.includes(fold(player.name)) &&
    player.dateOfBirth?.startsWith(entry.birth));
  if (!snapshot) return player;
  return {
    ...player,
    featured: true,
    marketValue: player.marketValue ?? { amount: snapshot.value, currency: 'EUR', asOf: '2024-10-21', source: snapshot.source },
    honors: player.honors.length ? player.honors : snapshot.honors,
    honorsNote: player.honors.length ? 'Honors reported by the data provider.' : 'Selected honors through 2024 — not a complete or live career tally.',
  };
}
