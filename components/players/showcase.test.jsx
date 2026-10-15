// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClubTabs from '@/components/club/ClubTabs';
import PlayerBanner from './PlayerBanner';
import SeasonStats from './SeasonStats';
import TrophyCabinet from './TrophyCabinet';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
let container; let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = async (element) => { await act(async () => root.render(element)); };
const click = async (element) => { await act(async () => element.click()); };
const button = (text) => [...container.querySelectorAll('button')].find((element) => element.textContent.includes(text));
const honors = [
  { id: 'golden-boy', name: 'Golden Boy', category: 'individual', years: ['2024'], source: 'https://honors.example/golden-boy' },
  { id: 'kopa', name: 'Kopa Trophy', category: 'individual', years: ['2024'] },
  { id: 'league', name: 'League title', category: 'team', years: ['2022–23', '2024–25'], source: 'https://honors.example/league' },
];

describe('clickable roster cards', () => {
  it('makes the entire card a keyboard-accessible link to the correct player id and club context', async () => {
    const players = [{ id: '362150', name: 'Lamine Yamal', position: 'Forward', group: 'Forwards', jersey: '10' }, { id: '250465', name: 'Pedri', position: 'Midfielder', group: 'Midfielders', jersey: '8' }];
    await render(<ClubTabs squad={[{ group: 'Squad', players }]} club={{ espnId: '83', league: { slug: 'esp.1' } }} />);
    await click(button('Squad'));
    for (const player of players) {
      const link = container.querySelector(`a[aria-label="Open ${player.name} player profile"]`);
      expect(link.getAttribute('href')).toBe(`/player/${player.id}?club=83&league=esp.1`);
      expect(link.closest('li').children).toHaveLength(1);
      expect(link.textContent).toContain(player.name);
      expect(link.className).toContain('focus-visible:ring-2');
    }
  });
});

describe('player showcase', () => {
  it('renders the information banner with a flag, dated estimate, and linked club crest', async () => {
    await render(<PlayerBanner player={{ name: 'Rodri', fullName: 'Rodrigo Hernández', age: 30, position: 'Midfielder', nationality: 'Spain', flag: 'https://cdn.example/esp.png', club: { id: '382', name: 'Manchester City', logo: 'https://cdn.example/crest.png' }, marketValue: { amount: 130_000_000, currency: 'EUR', asOf: '2024-10-11', source: 'https://value.example/rodri' }, updatedAt: Date.parse('2026-10-15') }} />);
    expect(container.querySelector('h1').textContent).toBe('Rodri');
    expect(container.textContent).toContain('30 years');
    expect(container.textContent).toContain('€130M');
    expect(container.textContent).toContain('Historical estimate');
    expect(container.textContent).toContain('2024-10-11');
    expect(container.querySelector('a[aria-label="Open Manchester City club profile"]').getAttribute('href')).toBe('/club/382-manchester-city');
    expect(container.querySelector('img[src="https://cdn.example/esp.png"]')).not.toBeNull();
  });

  it('renders all five season metrics responsively, preserving zeros and marking missing values', () => {
    const html = renderToStaticMarkup(<SeasonStats season={{ current: true, label: '2026–27 La Liga', appearances: 8, goals: 0, assists: 3, minutes: 600 }} />);
    for (const key of ['appearances', 'goals', 'assists', 'minutes', 'passAccuracy']) expect(html).toContain(`data-player-stat="${key}"`);
    expect(html).toContain('Current season performance');
    expect(html).toContain('lg:grid-cols-5');
    expect(html).toContain('Not reported');
    expect(html).toMatch(/data-player-stat="goals"[^]*?<dd[^>]*>0<\/dd>/);
    expect(html).not.toContain('0%');
    expect(renderToStaticMarkup(<SeasonStats season={{ current: false, label: '2024–25', goals: 3 }} />)).toContain('Last reported season');
  });

  it('filters individual/team honors and expands a glass trophy card to show seasons and source', async () => {
    await render(<TrophyCabinet honors={honors} note="Selected honors through 2024" />);
    expect(container.textContent).toContain('الفيترينة');
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('li').className).toContain('backdrop-blur-xl');
    await click(button('Team trophies'));
    expect(container.querySelectorAll('li')).toHaveLength(1);
    const trophy = container.querySelector('button[aria-expanded]');
    expect(trophy.textContent).toContain('League title');
    expect(trophy.getAttribute('aria-expanded')).toBe('false');
    await click(trophy);
    const details = document.getElementById(trophy.getAttribute('aria-controls'));
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain('2022–23 · 2024–25');
    expect(details.querySelector('a').getAttribute('rel')).toContain('noopener');
    await click(button('Individual'));
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.textContent).toContain('Golden Boy');
    expect(container.textContent).not.toContain('League title');
  });

  it('uses honest empty states rather than claiming an unknown player has no trophies or a zero market value', async () => {
    await render(<><PlayerBanner player={{ name: 'New Player', position: 'Player' }} /><TrophyCabinet honors={[]} /></>);
    expect(container.textContent).toContain('Missing data does not mean no trophies');
    expect(container.textContent).toContain('Not provided');
    expect(container.textContent).not.toContain('€0');
  });
});
