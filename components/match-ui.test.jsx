import { matchHref } from '@/lib/seo/matches';
/**
 * Server-render tests for the branded match & channel UI: they pin the parts of
 * the overhaul that matter — navy/lime palette, the pulsing LIVE indicator,
 * real live statistics (cards, scorers, minute), the Finished tab and the
 * "channels are always listed" behaviour.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BrandLogo from './BrandLogo';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

const router = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));

vi.mock('@/lib/utils/favorites', () => ({
  isTeamFavorited: () => false,
  toggleFavoriteTeam: () => {},
  getFavoriteTeams: () => [],
}));

const { default: MatchCard } = await import('./MatchCard');
const { default: MatchGrid } = await import('./MatchGrid');
const { default: LiveChannelsGrid, StatusIndicator } = await import('./LiveChannelsGrid');
const { default: VotingBar } = await import('./predictions/VotingBar');
const { default: MatchChatPanel } = await import('./chat/MatchChatPanel');
const { default: PitchVisualization } = await import('./lineups/PitchVisualization');
const { default: GoalAlerts } = await import('./goals/GoalAlerts');
const { default: LiveMinute } = await import('./LiveMinute');
const { default: MatchStatsSection } = await import('./MatchStatsSection');

const LIVE_MATCH = {
  id: 'espn-700001',
  title: 'Arsenal vs Liverpool',
  sport: 'football',
  status: 'live',
  source: 'espn',
  timestamp: Date.now() - 30 * 60 * 1000,
  tournament: 'Premier League',
  country: 'England',
  priority: 2,
  homeTeam: { name: 'Arsenal', badge: 'https://cdn.example.com/ars.png' },
  awayTeam: { name: 'Liverpool', badge: 'https://cdn.example.com/liv.png' },
  leagueLogo: '',
  poster: '',
  venue: 'Emirates Stadium',
  note: '',
  sources: [{ source: 'wf', id: '1', url: 'https://cdn.example.com/a.m3u8', label: 'Server 1' }],
  fallbackChannels: [],
  currentMinute: "62'",
  currentMinuteNumber: 62,
  homeScore: 2,
  awayScore: 1,
  live: {
    cards: { home: { yellow: 0, red: 0 }, away: { yellow: 1, red: 1 } },
    scorers: { home: ["Bukayo Saka 20'"], away: ["Mohamed Salah 45'+0'"] },
    events: [],
    period: 'In Progress',
    detail: "62'",
  },
};

const UPCOMING_MATCH = {
  ...LIVE_MATCH,
  id: 'espn-700002',
  title: 'Real Madrid vs Barcelona',
  status: 'upcoming',
  timestamp: Date.now() + 90 * 60 * 1000,
  homeTeam: { name: 'Real Madrid', badge: '' },
  awayTeam: { name: 'Barcelona', badge: '' },
  currentMinute: '',
  currentMinuteNumber: 0,
  homeScore: 0,
  awayScore: 0,
  live: undefined,
  sources: [],
};

const FINISHED_MATCH = {
  ...LIVE_MATCH,
  id: 'espn-700003',
  title: 'Inter vs Napoli',
  status: 'finished',
  timestamp: Date.now() - 3 * 60 * 60 * 1000,
  homeTeam: { name: 'Inter', badge: '' },
  awayTeam: { name: 'Napoli', badge: '' },
  currentMinute: 'FT',
  currentMinuteNumber: 90,
  homeScore: 3,
  awayScore: 0,
  sources: [],
};

describe('Limon lockup', () => {
  it('renders the Limon Live lemon-and-coin mark, wordmark and on-air animation with isolated SVG definitions at both sizes', () => {
    const html = renderToStaticMarkup(
      <div><BrandLogo className="w-[106px] h-auto" /><BrandLogo className="w-28 h-auto" /></div>
    );
    expect((html.match(/viewBox="0 0 320 150"/g) || [])).toHaveLength(2);
    // Lime lemon + burgundy leaf + the engraved EVIV Coin at its heart.
    expect(html).toContain('M60 26c12-14 26-16 34-15');
    expect(html).toContain('aria-label="Limon Live"');
    expect(html).toContain('stop-color="#CCFF00"');
    expect(html).toContain('stop-color="#2A0813"');
    expect(html).toContain('attributeName="r"');
    expect(html).toContain('aria-label="Limon Live"');
    // Two copies of the logo, each with its own gradient + leaf defs: no id collision.
    const gradients = [...html.matchAll(/<(?:linear|radial)Gradient id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(gradients).size).toBe(6);
    for (const id of gradients) expect(html).toContain(`url(#${id})`);
    // Each copy defines its own three gradients (gradient + leaf + coin).
    const copies = html.split('</svg>').slice(0, 2);
    expect(copies.map((copy) => [...copy.matchAll(/<(?:linear|radial)Gradient/g)].length)).toEqual([3, 3]);
  });
});

describe('MatchCard', () => {
  it('shows real live score, minute, cards and scorers with a pulsing lime dot', () => {
    const html = renderToStaticMarkup(<MatchCard match={LIVE_MATCH} tab="live" />);

    expect(html).toContain('Arsenal');
    expect(html).toContain('Liverpool');
    expect(html).toContain('62&#x27;'); // minute label is server-rendered escaped
    expect(html).toMatch(/live-dot/);
    expect(html).toMatch(/bg-lime-500/);
    expect(html).toContain('Bukayo Saka 20&#x27;');
    expect(html).toContain('Mohamed Salah');
    // Cards: one yellow + one red for the away side.
    expect((html.match(/bg-amber-400/g) || []).length).toBeGreaterThan(0);
    expect((html.match(/bg-red-500/g) || []).length).toBeGreaterThan(0);
    // Links into the player page for real stream resolution.
    expect(html).toContain(`href="${matchHref(LIVE_MATCH)}?tab=live"`);
    expect(html).toContain('1 stream server');
  });

  it('links an unlinked live ESPN match to its best-effort live channels without claiming they carry the fixture', () => {
    const html = renderToStaticMarkup(<MatchCard match={{ ...LIVE_MATCH, sources: [], feedStreamCount: 2, feedStreamIsFallback: true }} tab="live" />);
    expect(html).toContain('2 live channels');
    expect(html).toContain('fixture unverified');
    expect(html).toContain('Try Live Channels');
    expect(html).not.toContain('Pending Link');
    expect(html).toContain(`href="${matchHref(LIVE_MATCH)}?tab=live"`);
  });

  it('never labels a live ESPN fixture Pending Link even when the feed is unavailable', () => {
    const html = renderToStaticMarkup(<MatchCard match={{ ...LIVE_MATCH, sources: [] }} tab="live" />);
    expect(html).toContain('Explore Streams');
    expect(html).not.toContain('Pending Link');
  });

  it('renders a kickoff countdown for upcoming fixtures and no fake score', () => {
    const html = renderToStaticMarkup(<MatchCard match={UPCOMING_MATCH} tab="upcoming" />);
    expect(html).toContain('Kickoff in');
    expect(html).not.toMatch(/live-dot/);
    expect(html).toContain('Pending Link');
  });

  it('renders the finished state with FT and the final score', () => {
    const html = renderToStaticMarkup(<MatchCard match={FINISHED_MATCH} tab="finished" />);
    expect(html).toContain('FT');
    expect(html).toContain('Full time');
    expect(html).toContain(`href="${matchHref(FINISHED_MATCH)}?tab=finished"`);
  });
});

describe('MatchGrid', () => {
  const matches = [LIVE_MATCH, UPCOMING_MATCH, FINISHED_MATCH];

  it('exposes Live / Upcoming / Finished tabs with real counts', () => {
    const html = renderToStaticMarkup(<MatchGrid matches={matches} defaultTab="live" />);
    expect(html).toContain('Live Now (1)');
    expect(html).toContain('Upcoming (1)');
    expect(html).toContain('Finished (1)');
    expect(html).toContain('Arsenal');
    expect(html).not.toContain('Inter');
  });

  it('lists completed matches in the Finished tab', () => {
    const html = renderToStaticMarkup(<MatchGrid matches={matches} defaultTab="finished" />);
    expect(html).toContain('Inter');
    expect(html).toContain('Napoli');
    expect(html).not.toContain('Arsenal');
  });

  it('never invents a live state for ESPN fixtures still marked upcoming', () => {
    const stale = { ...UPCOMING_MATCH, timestamp: Date.now() - 45 * 60 * 1000 };
    const html = renderToStaticMarkup(<MatchGrid matches={[stale]} defaultTab="upcoming" />);
    expect(html).toContain('Real Madrid');
    expect(html).not.toMatch(/live-dot/);
  });

  it('promotes catalogue fixtures at kickoff time (upstream status lags)', () => {
    const catalogue = { ...UPCOMING_MATCH, id: 'wf-1', source: 'watchfooty', timestamp: Date.now() - 10 * 60 * 1000 };
    const html = renderToStaticMarkup(<MatchGrid matches={[catalogue]} defaultTab="live" />);
    expect(html).toContain('Real Madrid');
    expect(html).toMatch(/live-dot/);
  });
});

describe('LiveChannelsGrid', () => {
  const channels = [
    { id: 'a', name: 'Live Event One', group: 'Football', source: 'feed', status: 'live', href: '/channel/a', playable: true },
    { id: 'b', name: 'Standby Channel', group: 'Football', source: 'feed', status: 'unknown', href: '/channel/b', playable: true },
    { id: 'c', name: 'Blocked Channel', group: 'Football', source: 'feed', status: 'offline', href: '/channel/c', playable: true },
  ];

  it('lists every channel by default, including unverified ones', () => {
    const html = renderToStaticMarkup(<LiveChannelsGrid initialChannels={channels} initialCheckedAt={Date.now()} />);
    expect(html).toContain('Live Event One');
    expect(html).toContain('Standby Channel');
    expect(html).toContain('Blocked Channel');
    expect(html).toContain('href="/channel/c"');
    expect(html).toContain('1 live');
    expect(html).toContain('1 standby');
    expect(html).toContain('/api/proxy');
  });

  it('labels blocked probes as Standby rather than offline', () => {
    expect(renderToStaticMarkup(<StatusIndicator status="unknown" />)).toContain('Standby');
    expect(renderToStaticMarkup(<StatusIndicator status="live" />)).toContain('Live');
    expect(renderToStaticMarkup(<StatusIndicator status="offline" />)).toContain('Unreachable');
  });
});

describe('Watch page interactive match components', () => {
  it('renders VotingBar with home, draw and away prediction buttons', () => {
    const html = renderToStaticMarkup(
      <VotingBar
        matchId="espn-700001"
        homeTeam={{ name: 'Arsenal', badge: '' }}
        awayTeam={{ name: 'Liverpool', badge: '' }}
      />
    );
    expect(html).toContain('Who will win?');
    expect(html).toContain('Arsenal');
    expect(html).toContain('Draw');
    expect(html).toContain('Liverpool');
  });

  it('renders MatchChatPanel with message list and reaction buttons', () => {
    const html = renderToStaticMarkup(<MatchChatPanel matchId="espn-700001" />);
    expect(html).toContain('Live Match Chat');
    expect(html).toContain('No messages yet');
    expect(html).toContain('Celebrate goal');
  });

  it('renders PitchVisualization with formation and player shirts', () => {
    const html = renderToStaticMarkup(
      <PitchVisualization
        teamName="Arsenal"
        formation="4-3-3"
        players={[
          { name: 'Raya', role: 'GK' },
          { name: 'Saliba', role: 'DEF' },
          { name: 'Odegaard', role: 'MID' },
          { name: 'Saka', role: 'FWD' },
        ]}
      />
    );
    expect(html).toContain('Arsenal');
    expect(html).toContain('4-3-3');
    expect(html).toContain('Raya');
    expect(html).toContain('Saka');
  });

  it('renders GoalAlerts button and LiveMinute DVR controls', () => {
    const alertsHtml = renderToStaticMarkup(
      <GoalAlerts
        matchId="espn-700001"
        homeTeam={{ name: 'Arsenal', badge: '' }}
        awayTeam={{ name: 'Liverpool', badge: '' }}
      />
    );
    expect(alertsHtml).toContain('Enable Goal Alerts');

    const minuteHtml = renderToStaticMarkup(<LiveMinute apiMinute="62'" apiMinuteNumber={62} />);
    expect(minuteHtml).toContain('LIVE: 62&#x27;');
    expect(minuteHtml).toContain('Minus 1 minute');
    expect(minuteHtml).toContain('Plus 1 minute');
  });

  it('renders MatchStatsSection with Tactical Lineups & Pitch even when boxscore is empty', () => {
    const html = renderToStaticMarkup(
      <MatchStatsSection
        teamStats={[]}
        commentary={[]}
        rosters={null}
        homeTeam={{ name: 'Arsenal', badge: '' }}
        awayTeam={{ name: 'Liverpool', badge: '' }}
      />
    );
    expect(html).toContain('Tactical Lineups');
    expect(html).toContain('Arsenal');
    expect(html).toContain('Liverpool');
  });
});

