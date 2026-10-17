import { matchHref } from '@/lib/seo/matches';
/**
 * Server-render tests for the UI/UX overhaul: club links everywhere, the
 * mobile tab bar, the fixed chat / voting widgets, the redesigned standings
 * and the club page building blocks.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import eng1 from '../lib/providers/__fixtures__/espn-standings-eng1.json';
import leadersJson from '../lib/providers/__fixtures__/espn-leaders-eng1.json';
import botolaJson from '../lib/providers/__fixtures__/sportsdb-table-botola.json';
import teamJson from '../lib/providers/__fixtures__/espn-team-arsenal.json';
import scheduleJson from '../lib/providers/__fixtures__/espn-schedule-arsenal.json';
import fixturesJson from '../lib/providers/__fixtures__/espn-fixtures-arsenal.json';
import rosterJson from '../lib/providers/__fixtures__/espn-roster-arsenal.json';
import { normalizeEspnLeaders, normalizeEspnStandings, normalizeSportsDbTable } from '../lib/standings';
import { groupSquad, normalizeEspnTeam, normalizeRoster, normalizeTeamSchedule } from '../lib/clubs/espnClub';

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

let pathname = '/standings';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
}));

vi.mock('@/lib/utils/favorites', () => ({
  isTeamFavorited: () => false,
  toggleFavoriteTeam: () => {},
  getFavoriteTeams: () => [],
}));

const { default: MatchCard } = await import('./MatchCard');
const { default: MobileBottomNav } = await import('./nav/MobileBottomNav');
const { default: HeaderNav } = await import('./nav/HeaderNav');
const { default: VotingBar } = await import('./predictions/VotingBar');
const { default: MatchChatPanel } = await import('./chat/MatchChatPanel');
const { default: StandingsView } = await import('./standings/StandingsView');
const { default: ClubTabs } = await import('./club/ClubTabs');
const { default: ClubHero } = await import('./club/ClubHero');
const { default: FormStrip } = await import('./club/FormStrip');
const { default: SoundToggle } = await import('./ui/SoundToggle');

const MATCH = {
  id: 'espn-700001',
  title: 'Arsenal vs Liverpool',
  status: 'live',
  source: 'espn',
  timestamp: Date.now() - 30 * 60 * 1000,
  tournament: 'Premier League',
  homeTeam: { id: '359', name: 'Arsenal', badge: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png' },
  awayTeam: { id: '364', name: 'Liverpool', badge: 'https://a.espncdn.com/i/teamlogos/soccer/500/364.png' },
  sources: [{ source: 'wf', id: '1', url: 'https://cdn.example.com/a.m3u8', label: 'Server 1' }],
  homeScore: 2,
  awayScore: 1,
  currentMinute: "62'",
  currentMinuteNumber: 62,
};

const LEAGUES = [
  { slug: 'eng.1', name: 'Premier League', shortName: 'Premier League', country: 'England' },
  { slug: 'mar.1', name: 'Botola Pro', shortName: 'Botola Pro', country: 'Morocco' },
];

function standingsBundle(overrides = {}) {
  const { season, groups } = normalizeEspnStandings(eng1);
  return {
    league: { slug: 'eng.1', name: 'Premier League', shortName: 'Premier League', country: 'England', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
    season,
    groups,
    scorers: normalizeEspnLeaders(leadersJson, 'goals'),
    assists: normalizeEspnLeaders(leadersJson, 'assists'),
    source: 'espn',
    partial: false,
    leadersAvailable: true,
    updatedAt: 0,
    ...overrides,
  };
}

describe('club links across the app', () => {
  it('links both clubs from a match card without nesting anchors inside the card link', () => {
    const html = renderToStaticMarkup(<MatchCard match={MATCH} tab="live" />);
    expect(html).toContain('href="/club/359-arsenal"');
    expect(html).toContain('href="/club/364-liverpool"');
    // The whole-card link is an empty overlay, so club links are siblings, not children.
    expect(html).toContain(`<a href="${matchHref(MATCH)}?tab=live" aria-label="Arsenal vs Liverpool — open match"`);
    expect(html).toMatch(/aria-label="Arsenal vs Liverpool — open match"[^>]*><\/a>/);
    expect(html).toContain('rounded-3xl');
  });

  it('falls back to name slugs for catalogue teams without an ESPN id', () => {
    const html = renderToStaticMarkup(
      <MatchCard match={{ ...MATCH, homeTeam: { name: 'Raja CA', badge: '' }, awayTeam: { name: 'Wydad AC', badge: '' } }} tab="live" />
    );
    expect(html).toContain('href="/club/raja-ca"');
    expect(html).toContain('href="/club/wydad-ac"');
  });
});

describe('navigation', () => {
  it('renders the four mobile tabs plus the coin wallet, and marks the active destination', () => {
    // Phase 2: the Live Channels tab exists only while Live TV is enabled.
    // This test covers the full enabled nav; the hidden default is asserted below.
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    pathname = '/club/359-arsenal';
    const html = renderToStaticMarkup(<MobileBottomNav />);
    for (const label of ['Matches', 'Live Channels', 'Standings', 'Multi-View', 'Wallet']) expect(html).toContain(label);
    for (const href of ['href="/"', 'href="/channels"', 'href="/standings"', 'href="/multistream"', 'href="/profile#rewards"']) expect(html).toContain(href);
    // The wallet tab carries the animated EVIV Coin.
    expect(html).toContain('data-eviv-coin');
    expect(html).toMatch(/href="\/standings"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/standings"/);
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1);
    expect(html).toContain('md:hidden');
    expect(html).toContain('safe-area-inset-bottom');
    vi.unstubAllEnvs();
  });

  it('hides the Live Channels tab while Live TV is disabled (Phase 2 default)', () => {
    pathname = '/club/359-arsenal';
    const html = renderToStaticMarkup(<MobileBottomNav />);
    expect(html).not.toContain('Live Channels');
    expect(html).not.toContain('href="/channels"');
    for (const label of ['Matches', 'Standings', 'Multi-View', 'Wallet']) expect(html).toContain(label);
  });

  it('highlights the current page in the desktop header', () => {
    // Phase 2: /channels is only in the header while Live TV is enabled.
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    pathname = '/channel/abc';
    const html = renderToStaticMarkup(<HeaderNav />);
    expect(html).toMatch(/href="\/channels"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/channels"/);
    expect(html).toContain('href="/highlights"');
    vi.unstubAllEnvs();
    // Default (hidden): no /channels entry in the header at all.
    const hidden = renderToStaticMarkup(<HeaderNav />);
    expect(hidden).not.toContain('href="/channels"');
    expect(hidden).toContain('href="/highlights"');
  });

  it('exposes the sound switch with an accessible state', () => {
    const html = renderToStaticMarkup(<SoundToggle />);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Mute interface sounds');
  });
});

describe('fixed match widgets', () => {
  it('never renders the chat input disabled and offers Enter-to-send', () => {
    // Phase 7: collapsed by default — the composer mounts once expanded.
    const collapsed = renderToStaticMarkup(<MatchChatPanel matchId="espn-1" />);
    expect(collapsed).toContain('Live Match Chat');
    expect(collapsed).toContain('Expand chat');
    expect(collapsed).not.toContain('aria-label="Chat message"');
    const html = renderToStaticMarkup(<MatchChatPanel matchId="espn-1" defaultOpen />);
    const input = html.match(/<input[^>]*aria-label="Chat message"[^>]*>/)?.[0] || '';
    expect(input).not.toBe('');
    expect(input).not.toContain('disabled');
    expect(input).toContain('enterKeyHint="send"');
    expect(input).toContain('maxLength="280"');
    expect(html).toContain('Live Match Chat');
    expect(html).toContain('No messages yet');
  });

  it('renders one-tap prediction buttons with live percentages', () => {
    const html = renderToStaticMarkup(
      <VotingBar matchId="espn-1" homeTeam={{ name: 'Arsenal', badge: '' }} awayTeam={{ name: 'Liverpool', badge: '' }} />
    );
    expect((html.match(/aria-pressed="false"/g) || []).length).toBe(3);
    expect(html).toContain('0 votes');
    expect(html).toContain('Be the first to call it');
    expect(html).toContain('Arsenal to win — 0%');
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });
});

describe('standings redesign', () => {
  it('renders league pills, category tabs and the full table with club links', () => {
    const html = renderToStaticMarkup(
      <StandingsView leagues={LEAGUES} initialLeague="eng.1" initialView="table" initialData={standingsBundle()} />
    );
    expect(html).toContain('role="tablist" aria-label="League"');
    expect(html).toContain('Top Scorers');
    expect(html).toContain('Top Assists');
    for (const head of ['Pos', 'Team', '>P<', '>W<', '>D<', '>L<', '>GF<', '>GA<', '>GD<', '>Pts<']) expect(html).toContain(head);
    expect(html).toContain('href="/club/382-manchester-city"');
    expect(html).toContain('Man City');
    expect(html).toContain('+11');
    expect(html).toContain('Champions League');
    expect(html).toContain('Season 2026-27');
  });

  it('renders the scorers and assists leaderboards', () => {
    const scorers = renderToStaticMarkup(
      <StandingsView leagues={LEAGUES} initialLeague="eng.1" initialView="scorers" initialData={standingsBundle()} />
    );
    expect(scorers).toContain('Erling Haaland');
    expect(scorers).toContain('href="/club/382-manchester-city"');
    expect(scorers).toContain('Goals');

    const assists = renderToStaticMarkup(
      <StandingsView leagues={LEAGUES} initialLeague="eng.1" initialView="assists" initialData={standingsBundle()} />
    );
    expect(assists).toContain('Pascal Gross');
    expect(assists).toContain('href="/club/331-brighton-and-hove-albion"');
  });

  it('labels partial tables and leagues without leaderboards honestly', () => {
    const botola = standingsBundle({
      league: { slug: 'mar.1', name: 'Botola Pro', shortName: 'Botola Pro', country: 'Morocco' },
      groups: normalizeSportsDbTable(botolaJson),
      scorers: [],
      assists: [],
      source: 'thesportsdb',
      partial: true,
      leadersAvailable: false,
    });
    const table = renderToStaticMarkup(<StandingsView leagues={LEAGUES} initialLeague="mar.1" initialView="table" initialData={botola} />);
    expect(table).toContain('Maghreb Fez');
    expect(table).toContain('href="/club/maghreb-fez"');
    expect(table).toContain('Showing the top 5 clubs');
    expect(table).toContain('Form');
    const scorers = renderToStaticMarkup(<StandingsView leagues={LEAGUES} initialLeague="mar.1" initialView="scorers" initialData={botola} />);
    expect(scorers).toContain('Top scorers unavailable');
  });

  it('shows a loading skeleton instead of fake rows while data is fetched', () => {
    const html = renderToStaticMarkup(<StandingsView leagues={LEAGUES} initialLeague="eng.1" initialView="table" initialData={null} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Manchester City');
  });
});

describe('club page building blocks', () => {
  const club = normalizeEspnTeam(teamJson);
  const all = [...normalizeTeamSchedule(scheduleJson, '359'), ...normalizeTeamSchedule(fixturesJson, '359')];
  const results = all.filter((m) => m.status === 'finished').sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const fixtures = all.filter((m) => m.status !== 'finished');
  const squad = groupSquad(normalizeRoster(rosterJson));

  it('renders the hero with crest, league link, record and club colours', () => {
    const html = renderToStaticMarkup(<ClubHero club={club} form={['W', 'W']} />);
    expect(html).toContain('Arsenal');
    expect(html).toContain('href="/standings?league=eng.1"');
    expect(html).toContain('2nd in English Premier League');
    expect(html).toContain('5W');
    expect(html).toContain('Club colours');
    expect(html).toContain('#e20520');
    expect(html).toContain('linear-gradient(135deg');
  });

  it('renders the three club tabs with results linking to match centres and opponents', () => {
    const html = renderToStaticMarkup(<ClubTabs results={results} fixtures={fixtures} squad={squad} form={['W', 'W']} />);
    expect(html).toContain('Form &amp; Results');
    expect(html).toContain('Fixtures');
    expect(html).toContain('Squad');
    expect(html).toContain('Recent form');
    expect(html).toMatch(/href="\/match\/arsenal-vs-lille-[^"]+--espn-401915417"/);
    expect(html).toContain('href="/club/166-lille"');
    expect(html).toContain('UEFA Champions League');
    expect(html).toContain('3–0');
  });

  it('renders a W/D/L form strip oldest to newest', () => {
    const html = renderToStaticMarkup(<FormStrip form={['L', 'D', 'W']} />);
    expect(html).toContain('Recent form: Loss, Draw, Win');
    expect(html.indexOf('>L<')).toBeLessThan(html.indexOf('>W<'));
  });
});
