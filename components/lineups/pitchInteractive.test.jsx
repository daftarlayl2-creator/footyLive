// @vitest-environment happy-dom
/**
 * Interactive pitch: aligned rows, jersey-number badges, player cards with a
 * rating and a cutout (or the branded silhouette when no PNG exists).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PitchVisualization from './PitchVisualization';
import { FORMATION_IDS, PITCH, formationLayout, placePlayers } from '@/lib/lineups/formations';

const XI = [
  { name: 'Raya', role: 'GK', number: 1, rating: 7.4 },
  { name: 'Timber', role: 'DEF', number: 12 },
  { name: 'Saliba', role: 'DEF', number: 2, rating: 8.1 },
  { name: 'Gabriel', role: 'DEF', number: 6 },
  { name: 'White', role: 'DEF', number: 4 },
  { name: 'Rice', role: 'MID', number: 41 },
  { name: 'Odegaard', role: 'MID', number: 8, rating: 8.6 },
  { name: 'Havertz', role: 'MID', number: 29 },
  { name: 'Saka', role: 'FWD', number: 7, rating: 9.1, cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/saka.png' },
  { name: 'Jesus', role: 'FWD', number: 9 },
  { name: 'Trossard', role: 'FWD', number: 19 },
];

let container;
let root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = async (element) => {
  await act(async () => root.render(element));
};

describe('PitchVisualization — aligned grid', () => {
  it('keeps every player of a line on one shared y for every formation', () => {
    for (const formation of FORMATION_IDS) {
      const html = renderToStaticMarkup(<PitchVisualization formation={formation} players={XI} teamName="Arsenal" />);
      expect(html).toContain(`data-pitch-formation="${formation}"`);
      const nodes = [...html.matchAll(/data-pitch-row="([^"]+)" data-pitch-x="([\d.]+)" data-pitch-y="([\d.]+)"/g)].map((match) => ({
        row: match[1],
        x: Number(match[2]),
        y: Number(match[3]),
      }));
      expect(nodes.length, formation).toBe(11);
      const rows = new Map();
      for (const node of nodes) {
        if (rows.has(node.row)) expect(node.y).toBe(rows.get(node.row));
        else rows.set(node.row, node.y);
      }
      // …and no two team-mates on one line closer than one node diameter.
      for (const row of new Set(nodes.map((node) => node.row))) {
        const xs = nodes.filter((node) => node.row === row).map((node) => node.x).sort((a, b) => a - b);
        for (let index = 1; index < xs.length; index += 1) {
          expect(xs[index] - xs[index - 1]).toBeGreaterThan(PITCH.nodeRadius * 2);
        }
      }
    }
  });

  it('draws the jersey number inside each badge and a label that never overlaps', () => {
    for (const formation of FORMATION_IDS) {
      const html = renderToStaticMarkup(<PitchVisualization formation={formation} players={XI} />);
      expect(html).toContain('data-pitch-number="7"');
      expect(html).toContain('data-pitch-number="41"');

      // Pair every rendered label with its node position.
      const nodes = [
        ...html.matchAll(
          /data-pitch-row="([^"]+)" data-pitch-x="([\d.]+)"[^>]*>.*?data-pitch-label="([^"]*)"/g
        ),
      ].map((match) => ({ row: match[1], x: Number(match[2]), label: match[3] }));
      expect(nodes.length, formation).toBe(11);

      // Two labels on one line must not touch: each claims half of its own width.
      for (const row of new Set(nodes.map((node) => node.row))) {
        const line = nodes.filter((node) => node.row === row).sort((a, b) => a.x - b.x);
        for (let index = 1; index < line.length; index += 1) {
          const room = line[index].x - line[index - 1].x - 1;
          const needed = ((line[index].label.length + line[index - 1].label.length) / 2) * PITCH.labelCharWidth;
          expect(needed, `${formation} ${row}: "${line[index - 1].label}" vs "${line[index].label}"`).toBeLessThanOrEqual(room);
        }
      }
    }
  });
});

describe('PitchVisualization — player card', () => {
  it('opens a card with the name, shirt number and rating on click', async () => {
    await render(<PitchVisualization formation="4-3-3" players={XI} />);
    const saka = container.querySelector('[data-pitch-player="Saka"]');
    expect(saka).toBeTruthy();
    await act(async () => {
      saka.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const card = container.querySelector('[data-pitch-player-card="Saka"]');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('9.1');
    expect(card.textContent).toContain('7');
    expect(card.querySelector('img[data-player-cutout]')?.getAttribute('src')).toContain('saka.png');
    // Clicking the same shirt again closes it.
    await act(async () => {
      container.querySelector('[data-pitch-player="Saka"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-pitch-player-card]')).toBeNull();
  });

  it('falls back to a branded silhouette and reports the real rating', async () => {
    await render(<PitchVisualization formation="4-3-3" players={XI} />);
    await act(async () => {
      container.querySelector('[data-pitch-player="Raya"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const keeper = container.querySelector('[data-pitch-player-card="Raya"]');
    expect(keeper.querySelector('[data-player-silhouette]')).toBeTruthy();
    expect(keeper.querySelector('[data-player-cutout]')).toBeNull();
    expect(keeper.textContent).toContain('7.40 rating');

    // A player nobody rated says so, instead of inventing a number.
    await act(async () => {
      container.querySelector('[data-pitch-player="Timber"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const defender = container.querySelector('[data-pitch-player-card="Timber"]');
    expect(defender.textContent).toContain('Rating not reported');
    expect(defender.textContent).toContain('12');
  });

  it('swaps a broken cutout for the silhouette instead of a broken image', async () => {
    await render(<PitchVisualization formation="4-3-3" players={XI} />);
    await act(async () => {
      container.querySelector('[data-pitch-player="Saka"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const image = container.querySelector('[data-player-cutout]');
    await act(async () => {
      image.dispatchEvent(new window.Event('error', { bubbles: false }));
    });
    expect(container.querySelector('[data-pitch-player-card="Saka"] [data-player-silhouette]')).toBeTruthy();
  });

  it('walks the roster with the keyboard and closes on Escape', async () => {
    await render(<PitchVisualization formation="4-2-3-1" players={XI} />);
    const keeper = container.querySelector('[data-pitch-player="Raya"]');
    await act(async () => {
      keeper.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(container.querySelector('[data-pitch-player-card="Raya"]')).toBeTruthy();
    await act(async () => {
      keeper.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(container.querySelector('[data-pitch-player-card]')).toBeTruthy();
    expect(container.querySelector('[data-pitch-player-card]').getAttribute('data-pitch-player-card')).not.toBe('Raya');
    await act(async () => {
      keeper.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-pitch-player-card]')).toBeNull();
  });

  it('renders the roster list and the formation note', () => {
    const html = renderToStaticMarkup(<PitchVisualization formation="3-4-3" players={XI} teamName="Arsenal" />);
    expect(html).toContain('data-pitch-roster');
    expect(html).toContain('Saka');
    expect(html).toContain('Raya');
    expect(html).toContain('3-4-3');
    expect(html).toContain(formationLayout('3-4-3').note);
    // The XI the geometry module placed is exactly the XI on screen.
    expect(placePlayers('3-4-3', XI)).toHaveLength(11);
  });

  it('shows an honest unavailable state instead of placeholder shirts when no lineup was published (Phase 4)', () => {
    for (const players of [undefined, []]) {
      const html = renderToStaticMarkup(<PitchVisualization formation="4-3-3" players={players} teamName="Arsenal" />);
      expect(html).toContain('data-lineup-unavailable');
      expect(html).toContain('Lineup not available');
      expect(html).toContain('Arsenal');
      expect(html).not.toContain('data-pitch-roster');
    }
  });

  it('labels an unpublished formation instead of asserting a default (Phase 4)', () => {
    const html = renderToStaticMarkup(<PitchVisualization formation="4-3-3" formationKnown={false} players={XI} teamName="Arsenal" />);
    expect(html).toContain('Formation not published');
    const known = renderToStaticMarkup(<PitchVisualization formation="4-4-2" players={XI} teamName="Arsenal" />);
    expect(known).toContain('4-4-2');
    expect(known).not.toContain('Formation not published');
  });
});
