/**
 * Formation geometry: aligned rows, no overlapping labels, no node collisions.
 *
 * These are the invariants that fixed the tactical-pitch bugs (players of one
 * line at different heights, names bleeding into the next shirt), so they are
 * asserted as arithmetic rather than as screenshots.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORMATION,
  FORMATION_IDS,
  FORMATION_LAYOUTS,
  PITCH,
  cutoutUrl,
  formationLayout,
  formationSlots,
  labelFor,
  maxLabelChars,
  normalizeFormation,
  normalizeRole,
  outfieldRowCount,
  placePlayers,
  playerNumber,
  playerRating,
  rosterRows,
  rowPositions,
} from './formations';

const XI = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CDM', 'RCM', 'LW', 'ST', 'RW'] as const;

const formationTotal = (id: keyof typeof FORMATION_LAYOUTS) =>
  FORMATION_LAYOUTS[id].rows.reduce((sum, row) => sum + row.count, 0);

describe('formation catalogue', () => {
  it('ships every requested shape with eleven players', () => {
    expect(FORMATION_IDS).toContain('4-3-3');
    expect(FORMATION_IDS).toContain('4-2-3-1');
    expect(FORMATION_IDS).toContain('3-4-3');
    for (const id of FORMATION_IDS) {
      expect(formationTotal(id), `${id} should field eleven`).toBe(11);
      const layout = FORMATION_LAYOUTS[id];
      expect(layout.rows[0].role).toBe('GK');
      expect(layout.rows.filter((row) => row.role === 'GK')).toHaveLength(1);
    }
  });

  it('normalises the ways a formation gets written down', () => {
    expect(normalizeFormation('433')).toBe('4-3-3');
    expect(normalizeFormation(' 4 - 2 - 3 - 1 ')).toBe('4-2-3-1');
    expect(normalizeFormation('٣-٤-٣')).toBe('3-4-3');
    expect(normalizeFormation('4-2-4')).toBe(DEFAULT_FORMATION);
    expect(normalizeFormation(null)).toBe(DEFAULT_FORMATION);
    expect(normalizeFormation('')).toBe(DEFAULT_FORMATION);
    expect(formationLayout('nonsense').id).toBe(DEFAULT_FORMATION);
    expect(outfieldRowCount('4-2-3-1')).toBe(4);
  });

  it("spreads a row symmetrically around the halfway line", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const xs = rowPositions(count);
      expect(xs).toHaveLength(count);
      const mid = (xs[0] + xs[xs.length - 1]) / 2;
      expect(Math.abs(mid - 50)).toBeLessThan(0.01);
    }
  });

  it('keeps every node inside the pitch and at least MIN_NODE_GAP apart', () => {
    for (const id of FORMATION_IDS) {
      const slots = formationSlots(id);
      expect(slots).toHaveLength(11);
      for (const slot of slots) {
        expect(slot.x).toBeGreaterThanOrEqual(PITCH.minX - 0.01);
        expect(slot.x).toBeLessThanOrEqual(PITCH.maxX + 0.01);
      }
      for (const rowKey of new Set(slots.map((slot) => slot.rowKey))) {
        const xs = slots
          .filter((slot) => slot.rowKey === rowKey)
          .map((slot) => slot.x)
          .sort((a, b) => a - b);
        for (let index = 1; index < xs.length; index += 1) {
          expect(xs[index] - xs[index - 1]).toBeGreaterThanOrEqual(PITCH.minNodeGap - 0.01);
        }
      }
    }
  });

  it('separates every pair of rows by at least MIN_ROW_GAP', () => {
    for (const id of FORMATION_IDS) {
      const ys = FORMATION_LAYOUTS[id].rows.map((row) => row.y).sort((a, b) => a - b);
      for (let index = 1; index < ys.length; index += 1) {
        expect(ys[index] - ys[index - 1]).toBeGreaterThanOrEqual(PITCH.minRowGap - 0.01);
      }
      expect(ys[0]).toBeGreaterThanOrEqual(PITCH.minX - 4);
      expect(ys[ys.length - 1]).toBeLessThanOrEqual(PITCH.maxX + 4);
    }
  });
});

describe('placing a real lineup', () => {
  const players = XI.map((role, index) => ({ name: `Player ${index + 1}`, role }));

  it('gives every player of a line the same y — aligned rows', () => {
    for (const id of FORMATION_IDS) {
      const placed = placePlayers(id, players);
      const rows = new Map<string, number>();
      for (const entry of placed) {
        if (rows.has(entry.rowKey)) {
          expect(entry.y).toBe(rows.get(entry.rowKey));
        } else {
          rows.set(entry.rowKey, entry.y);
        }
      }
      // Every node sits exactly on its layout row.
      const layout = formationLayout(id);
      for (const entry of placed) {
        expect(layout.rows[entry.rowIndex].y).toBe(entry.y);
      }
    }
  });

  it('never lets two nodes of one row collide', () => {
    for (const id of FORMATION_IDS) {
      const placed = placePlayers(id, players);
      const byRow = new Map<string, number[]>();
      for (const entry of placed) {
        byRow.set(entry.rowKey, [...(byRow.get(entry.rowKey) ?? []), entry.x]);
      }
      for (const xs of byRow.values()) {
        xs.sort((a, b) => a - b);
        for (let index = 1; index < xs.length; index += 1) {
          expect(xs[index] - xs[index - 1]).toBeGreaterThan(PITCH.nodeRadius * 2);
        }
      }
    }
  });

  it('truncates a label to the characters that fit its row gap', () => {
    // Two nodes are `gap` apart; the label may claim gap - 2 units of width.
    for (const gap of [13, 14, 16, 21, 28]) {
      const limit = maxLabelChars(gap);
      expect(limit * PITCH.labelCharWidth).toBeLessThanOrEqual(gap - 2 + 0.001);
      expect(labelFor('Ødegaard', gap).length).toBeLessThanOrEqual(limit);
      expect(labelFor('Ab', gap)).toBe('Ab');
    }
    // A ridiculously long name is cut from the tail, never longer than the row.
    expect(labelFor('Maximiliano Alejandro Rodriguez', 13).length).toBe(maxLabelChars(13));
  });

  it('keeps long names inside the row band for a real XI', () => {
    const names = [
      'Maximiliano Rodriguez',
      'Konstantinos Papadopoulos',
      'Aleksandar Mitrovic',
      'Gabriel dos Santos Magalhaes',
      'Emiliano Martinez',
      'William Saliba',
      'Declan Rice',
      'Martin Odegaard',
      'Bukayo Saka',
      'Gabriel Jesus',
      'Leandro Trossard',
    ];
    const placed = placePlayers('4-2-3-1', names.map((name, index) => ({ name, role: XI[index] })));
    const layout = formationLayout('4-2-3-1');
    for (const entry of placed) {
      const next = layout.rows[entry.rowIndex + 1];
      const previous = layout.rows[entry.rowIndex - 1];
      const neighbour = next ?? previous;
      const room = neighbour ? Math.abs(neighbour.y - entry.y) : PITCH.minRowGap;
      // The label may use the room below its badge, minus one unit of padding.
      expect(entry.label.length * PITCH.labelCharWidth).toBeLessThanOrEqual(room - 2 + 0.001);
    }
  });

  it('still shows players who arrive without a role', () => {
    const placed = placePlayers('4-3-3', [{ name: 'Mystery Winger' }, { name: 'Unknown Keeper' }]);
    expect(placed).toHaveLength(2);
    expect(placed[0].number).toBeTruthy();
    expect(placed[1].label).toBeTruthy();
  });

  it('draws placeholder shirts when no lineup was sent at all', () => {
    const placed = placePlayers('3-4-3', []);
    expect(placed).toHaveLength(11);
    expect(placed[0].number).toBe('1');
    expect(placed.filter((entry) => entry.role === 'DEF')).toHaveLength(3);
    expect(placed.filter((entry) => entry.role === 'MID')).toHaveLength(4);
    expect(placed.filter((entry) => entry.role === 'FWD')).toHaveLength(3);
  });

  it('widens a line that received extra players instead of stacking them', () => {
    const strikers = Array.from({ length: 6 }, (_, index) => ({ name: `Striker Number ${index + 1}`, role: 'FWD' }));
    const placed = placePlayers('4-2-3-1', strikers);
    expect(placed).toHaveLength(6);
    const xs = placed.map((entry) => entry.x).sort((a, b) => a - b);
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index] - xs[index - 1]).toBeGreaterThanOrEqual(PITCH.minNodeGap - 0.01);
    }
    // Labels also respect the horizontal neighbour, not just the row below.
    for (const entry of placed) {
      const nearest = placed
        .filter((other) => other !== entry)
        .map((other) => Math.abs(other.x - entry.x))
        .reduce((min, distance) => Math.min(min, distance), Infinity);
      const room = Math.max(3 * PITCH.labelCharWidth, nearest - 2);
      expect(entry.label.length * PITCH.labelCharWidth).toBeLessThanOrEqual(room + 0.001);
    }
    // Slot ids stay unique, so React keys and row guides cannot alias.
    expect(new Set(placed.map((entry) => `${entry.rowKey}-${entry.slotIndex}`)).size).toBe(6);
  });

  it('orders the roster by line, then by slot', () => {
    const roster = rosterRows(placePlayers('4-4-2', players));
    for (let index = 1; index < roster.length; index += 1) {
      const previous = roster[index - 1];
      const current = roster[index];
      expect(previous.rowIndex < current.rowIndex || previous.rowIndex === current.rowIndex).toBe(true);
      if (previous.rowIndex === current.rowIndex) expect(previous.slotIndex).toBeLessThan(current.slotIndex);
    }
  });
});

describe('shirt numbers, ratings and cutouts', () => {
  it('honours a real shirt number and otherwise uses football-accurate defaults', () => {
    expect(playerNumber({ number: 10 }, 'MID', 0)).toBe('10');
    expect(playerNumber({ jersey: '7' }, 'FWD', 1)).toBe('7');
    expect(playerNumber(null, 'GK', 0)).toBe('1');
    expect(playerNumber({}, 'MID', 0)).toBe('6');
    expect(playerNumber({ number: 250 }, 'DEF', 0)).toBe('99');
    expect(playerNumber({ number: 'abc' }, 'DEF', 0)).toBe('2');
  });

  it('reports a rating only when one was actually supplied', () => {
    expect(playerRating({ rating: 8.4 })).toBe('8.40');
    expect(playerRating({ stats: { rating: 7 } })).toBe('7.0');
    expect(playerRating({ rating: 12 })).toBe('10.0');
    expect(playerRating({})).toBeNull();
    expect(playerRating({ rating: 'n/a' })).toBeNull();
  });

  it('accepts only real image URLs as cutouts', () => {
    expect(cutoutUrl({ cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/x.png' })).toContain('thesportsdb');
    expect(cutoutUrl({ photo: '/players/raya.png' })).toBe('/players/raya.png');
    expect(cutoutUrl({ image: 'data:image/png;base64,AAA' })).toContain('data:image/png');
    expect(cutoutUrl({ photo: 'javascript:alert(1)' })).toBeNull();
    expect(cutoutUrl({})).toBeNull();
    expect(cutoutUrl(null)).toBeNull();
  });

  it('maps provider position names onto pitch lines', () => {
    expect(normalizeRole('goalkeeper')).toBe('GK');
    expect(normalizeRole('GK')).toBe('GK');
    expect(normalizeRole('Left Back')).toBe('DEF');
    expect(normalizeRole('Center-Back')).toBe('DEF');
    expect(normalizeRole('CDM')).toBe('MID');
    expect(normalizeRole('Attacking Midfield')).toBe('MID');
    expect(normalizeRole('Right Winger')).toBe('FWD');
    expect(normalizeRole('Center-Forward')).toBe('FWD');
    expect(normalizeRole('Physio')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});
