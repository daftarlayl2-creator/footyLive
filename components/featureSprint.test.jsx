// @vitest-environment happy-dom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useGoalAudio from '@/lib/hooks/useGoalAudio';
import { playGoalAlert } from '@/lib/sound/goalAlert';
import { getFavoriteTeams, getFavoriteTeamDetails } from '@/lib/utils/favorites';
import FavoritesHub from './favorites/FavoritesHub';
import GoalAlerts from './goals/GoalAlerts';
import LiveScoreboard from './LiveScoreboard';
import SoundToggle from './ui/SoundToggle';
import { MatchInsightsContent } from './predictions/MatchInsights';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/sound/goalAlert', async (original) => ({ ...await original(), playGoalAlert: vi.fn(() => true) }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };
const click = async (button) => { await act(async () => button.click()); };
function AudioObserver({ matches, favorites }) {
  useGoalAudio(matches, (match) => favorites.includes(match.homeTeam.name));
  return null;
}
const fixture = (id, score) => ({ id, status: 'live', homeScore: score, awayScore: 0, homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } });

describe('automatic goal alert integration', () => {
  it('only alerts for relevant score increments, without initial, stale or duplicate replays', async () => {
    await render(<AudioObserver matches={[fixture('integration-a', 0)]} favorites={[]} />);
    await render(<AudioObserver matches={[fixture('integration-a', 1)]} favorites={[]} />);
    expect(playGoalAlert).not.toHaveBeenCalled();
    await render(<AudioObserver matches={[fixture('integration-a', 1)]} favorites={['Arsenal']} />);
    expect(playGoalAlert).not.toHaveBeenCalled();
    await render(<AudioObserver matches={[fixture('integration-a', 2)]} favorites={['Arsenal']} />);
    expect(playGoalAlert).toHaveBeenCalledOnce();
    await render(<AudioObserver matches={[fixture('integration-a', 2)]} favorites={['Arsenal']} />);
    await render(<AudioObserver matches={[fixture('integration-a', 1)]} favorites={['Arsenal']} />);
    await render(<AudioObserver matches={[fixture('integration-a', 2)]} favorites={['Arsenal']} />);
    expect(playGoalAlert).toHaveBeenCalledOnce();
    await render(<AudioObserver matches={[fixture('integration-b', 5)]} favorites={['Arsenal']} />);
    expect(playGoalAlert).toHaveBeenCalledOnce();
  });
  it('deduplicates overlapping observers and monitors fixtures outside the selected tab', async () => {
    const Pair = ({ score }) => <><AudioObserver matches={[fixture('integration-pair', score)]} favorites={['Arsenal']} /><AudioObserver matches={[fixture('integration-pair', score)]} favorites={['Arsenal']} /></>;
    await render(<Pair score={0} />);
    await render(<Pair score={1} />);
    expect(playGoalAlert).toHaveBeenCalledOnce();
  });
  it('shares a live poll between the watch scoreboard and audio alerts without requiring notification permission', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ match: { status: 'live', homeScore: 1, awayScore: 0 } }) }));
    vi.stubGlobal('fetch', fetcher);
    await render(<SWRConfig value={{ provider: () => new Map() }}>
      <GoalAlerts matchId="integration-watch" homeTeam={{ name: 'Arsenal' }} awayTeam={{ name: 'Chelsea' }} status="live" homeScore={0} awayScore={0} />
      <LiveScoreboard matchId="integration-watch" initial={{ status: 'live', homeName: 'Arsenal', awayName: 'Chelsea', homeScore: 0, awayScore: 0 }} />
    </SWRConfig>);
    expect(playGoalAlert).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(20050); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(playGoalAlert).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('Enable Goal Alerts');
  });
});

function FavoritesHarness({ matches }) {
  const [favorites, setFavorites] = useState(getFavoriteTeams);
  useEffect(() => {
    const sync = () => setFavorites(getFavoriteTeams());
    window.addEventListener('favorites-updated', sync);
    return () => window.removeEventListener('favorites-updated', sync);
  }, []);
  return <FavoritesHub matches={matches} favorites={favorites} />;
}

describe('favorites hub', () => {
  it('adds/removes teams, preserves metadata and opens a club profile from its crest', async () => {
    const match = fixture('hub', 0);
    match.homeTeam.id = '359';
    match.homeTeam.badge = 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png';
    match.awayTeam.badge = '/test-crest.png';
    await render(<FavoritesHarness matches={[match]} />);
    expect(container.textContent).toContain('Add Favorite Teams');
    await click(container.querySelector('button[aria-controls="favorite-team-picker"]'));
    const teamButton = [...container.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.includes('Arsenal'));
    await click(teamButton);
    expect(getFavoriteTeams()).toEqual(['Arsenal']);
    expect(container.querySelector('a[aria-label="Open Arsenal club profile"]').getAttribute('href')).toBe('/club/359-arsenal');
    expect(getFavoriteTeamDetails().arsenal.badge).toContain('/500/359.png');
    await click(teamButton);
    expect(getFavoriteTeams()).toEqual([]);
    expect(container.querySelector('a[aria-label="Open Arsenal club profile"]')).toBeNull();
  });
});

describe('sound settings and insights accessibility', () => {
  it('exposes separate persistent toggles plus a goal sound test that disables when muted', async () => {
    await render(<SoundToggle />);
    const toggles = container.querySelectorAll('[role="switch"]');
    expect(toggles).toHaveLength(2);
    const goals = container.querySelector('[aria-label="Retro goal alerts"]');
    await click(goals);
    expect(goals.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('button:disabled').textContent).toContain('Test goal sound');
    expect(window.localStorage.getItem('eviv:goal-alerts')).toBe('off');
    expect(toggles[0].getAttribute('aria-checked')).toBe('true');
  });
  it('renders labeled, exact percentages and 2–3 concise insight cards', () => {
    const html = renderToStaticMarkup(<MatchInsightsContent homeTeam={{ name: 'Arsenal' }} awayTeam={{ name: 'Chelsea' }} data={{ probabilities: { home: 50, draw: 25, away: 25 }, insights: ['Arsenal won 4 of their last 5 matches.', 'Chelsea won 2 of their last 5 matches.'], coverage: { form: true, h2h: false, standings: true } }} />);
    expect(html).toContain('Win probability: Arsenal 50%, Draw 25%, Chelsea 25%');
    expect(html).toContain('width:50%');
    expect(html).toContain('H2H: unavailable');
    expect(html.match(/<li /g)).toHaveLength(2);
  });
  it('renders honest insufficient-data messaging instead of fictional odds', () => {
    const html = renderToStaticMarkup(<MatchInsightsContent data={{ probabilities: null, insights: ['History unavailable.', 'Standings unavailable.'], coverage: { form: false, h2h: false, standings: false } }} />);
    expect(html).toContain('Not enough history');
    expect(html).not.toContain('role="img"');
  });
});
