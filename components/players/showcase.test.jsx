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
    expect(container.textContent).toContain('Historical ·');
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
    expect(container.textContent).not.toContain('الفيترينة');
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

  it('shows the featured cutout in front of a semi-transparent national flag, styled like club cards', async () => {
    const portraits = [
      { src: 'https://r2.thesportsdb.com/images/media/player/cutout/yamal.png', kind: 'cutout', credit: 'TheSportsDB' },
      { src: 'https://a.espncdn.com/i/headshots/soccer/players/full/362150.png', kind: 'headshot', credit: 'ESPN' },
    ];
    await render(<PlayerBanner player={{ id: '362150', name: 'Lamine Yamal', position: 'Forward', jersey: '10', flag: 'https://cdn.example/esp.png', portraits, featured: true }} />);
    const frame = container.querySelector('[data-player-portrait]');
    expect(frame.getAttribute('data-player-portrait')).toBe('cutout');
    const cutout = frame.querySelector('img[alt="Lamine Yamal"]');
    expect(cutout.getAttribute('src')).toBe(portraits[0].src);
    expect(cutout.className).toContain('object-contain');
    expect(cutout.className).toContain('z-10');
    // High-resolution cutout: the card requests a big transparent PNG and marks it.
    expect(cutout.getAttribute('width')).toBe('1024');
    expect(cutout.getAttribute('height')).toBe('1228');
    expect(cutout.getAttribute('data-portrait-resolution')).toBe('high');
    expect(cutout.className).toContain('bg-transparent');
    expect(frame.getAttribute('data-player-cutout')).toBe('transparent');
    expect(frame.querySelector('[data-player-number-badge]').className).toContain('z-20');
    expect(frame.querySelector('[data-player-number-badge]').getAttribute('aria-label')).toBe('Shirt number 10');
    expect(frame.className).not.toContain('rounded-full');
    // The flag sits *behind* the player inside the card header, semi-transparent and decorative.
    const overlay = frame.querySelector('[data-player-flag-overlay]');
    expect(overlay.getAttribute('src')).toBe('https://cdn.example/esp.png');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.className).toContain('opacity-[0.28]');
    expect(frame.firstElementChild).toBe(overlay);
    // A faint watermark across the header mirrors the club hero's crest watermark.
    expect(container.querySelector('[data-player-flag-wash]').className).toContain('opacity-[0.09]');
    expect(container.querySelector('[data-portrait-attribution]').textContent).toContain('TheSportsDB');
    // No generic placeholder avatar.
    expect(container.querySelector('.lucide-user-round')).toBeNull();
  });

  it('falls through broken portraits to the next real headshot, then a branded silhouette', async () => {
    const portraits = [
      { src: 'https://r2.thesportsdb.com/images/media/player/cutout/missing.png', kind: 'cutout', credit: 'TheSportsDB' },
      { src: 'https://a.espncdn.com/i/headshots/soccer/players/full/1.png', kind: 'headshot', credit: 'ESPN' },
    ];
    await render(<PlayerBanner player={{ id: '1', name: 'Squad Player', position: 'Defender', jersey: '4', flag: 'https://cdn.example/mar.png', portraits }} />);
    const image = () => container.querySelector('[data-player-portrait] img[alt="Squad Player"]');
    await act(async () => image().dispatchEvent(new Event('error')));
    expect(image().getAttribute('src')).toBe(portraits[1].src);
    expect(container.querySelector('[data-portrait-attribution]')).toBeNull();
    await act(async () => image().dispatchEvent(new Event('error')));
    expect(image()).toBeNull();
    const silhouette = container.querySelector('[data-player-silhouette]');
    expect(silhouette.getAttribute('aria-label')).toContain('Squad Player');
    expect(silhouette.textContent).toBe('4');
    expect(silhouette.innerHTML).toContain('#CCFF00');
    // A broken flag disappears everywhere instead of showing a broken image.
    await act(async () => container.querySelector('[data-player-flag-overlay]').dispatchEvent(new Event('error')));
    expect(container.querySelector('[data-player-flag-overlay]')).toBeNull();
    expect(container.querySelector('[data-player-flag-wash]')).toBeNull();
  });

  it('rejects opaque portrait photos and unsafe URLs, keeping the flag and silhouette', async () => {
    await render(<PlayerBanner player={{ name: 'New signing', position: 'Forward', jersey: '9', flag: 'https://cdn.example/mar.png', portraits: [
      { src: 'https://cdn.example/photo.jpg', kind: 'photo' }, { src: 'javascript:alert(1)', kind: 'cutout' },
    ] }} />);
    expect(container.querySelector('[data-player-silhouette]')).not.toBeNull();
    expect(container.querySelector('[data-player-flag-overlay]')).not.toBeNull();
    expect(container.querySelector('[data-player-number-badge]').textContent).toBe('9');
    expect(container.querySelector('[data-player-portrait] img[alt="New signing"]')).toBeNull();
  });

  it('uses honest empty states rather than claiming an unknown player has no trophies or a zero market value', async () => {
    await render(<><PlayerBanner player={{ name: 'New Player', position: 'Player' }} /><TrophyCabinet honors={[]} /></>);
    expect(container.textContent).toContain('Missing data does not mean no trophies');
    expect(container.textContent).toContain('Not provided');
    expect(container.textContent).not.toContain('€0');
  });
});
