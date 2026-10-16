/**
 * Tactical formation geometry for the lineup pitch.
 *
 * One source of truth for *where* a player node sits, so the pitch can never
 * drift into the two bugs it used to have: players of the same line landing on
 * different heights ("aligned rows"), and name labels colliding with each other
 * or with the next node ("no text overlap").
 *
 * The rules, all enforced by `placePlayers` and asserted in the unit tests:
 *
 *   • GK sits on its own line; every outfield line has **one** shared `y`, so a
 *     back four reads as a straight line, not a zig-zag.
 *   • Nodes in a row are spread symmetrically around the halfway line
 *     (x = 50) and separated by at least `MIN_NODE_GAP` units.
 *   • Rows are separated by at least `MIN_ROW_GAP` units — enough for the shirt
 *     badge *plus* one label line, which is why labels never touch the row below.
 *   • A label is truncated to the characters that actually fit its row gap
 *     (`maxLabelChars`), instead of relying on luck.
 *
 * Coordinates are in the pitch's own 0–100 viewBox, with the keeper at the
 * bottom of the attacking half… in practice: `y` grows towards the opponent's
 * goal, exactly like the rendered SVG.
 */

export type FormationId =
  | '4-3-3'
  | '4-2-3-1'
  | '3-4-3'
  | '4-4-2'
  | '3-5-2'
  | '5-3-2'
  | '4-1-4-1';

export type LineRole = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Pitch geometry constants shared by the maths and the SVG. */
export const PITCH = Object.freeze({
  /** Playable band: nodes never leave these bounds (keeper included). */
  minX: 8,
  maxX: 92,
  /** Radius of a player node, in viewBox units. */
  nodeRadius: 4.2,
  /** Minimum horizontal distance between two nodes in the same row. */
  minNodeGap: 13,
  /** Minimum vertical distance between two rows (badge + label + breathing room). */
  minRowGap: 14,
  /** Approximate width of one label character at the pitch's font size. */
  labelCharWidth: 1.9,
  /** Label font size used by the renderer. */
  labelSize: 3.4,
});

export interface FormationRow {
  /** Stable key ('gk', 'def', 'mid', 'att'…) — used for data attributes. */
  key: string;
  role: LineRole;
  /** Shared vertical centre of the row. */
  y: number;
  /** How many nodes the row holds. */
  count: number;
}

export interface FormationLayout {
  id: FormationId;
  /** Bilingual label shown on the pitch header + the formation chip. */
  label: string;
  /** Short tactical note for the tooltip. */
  note: string;
  rows: readonly FormationRow[];
}

/**
 * Layouts, keeper → attack. `y` values are hand-picked to satisfy
 * `MIN_ROW_GAP` while keeping the shape recognisable, and every row's `x`
 * positions are derived (never hand-written), so alignment is structural.
 */
export const FORMATION_LAYOUTS: Record<FormationId, FormationLayout> = {
  '4-3-3': {
    id: '4-3-3',
    label: '4-3-3',
    note: 'Wide wingers, high press, one holding midfielder.',
    rows: [
      { key: 'gk', role: 'GK', y: 11, count: 1 },
      { key: 'def', role: 'DEF', y: 30, count: 4 },
      { key: 'mid', role: 'MID', y: 52, count: 3 },
      { key: 'att', role: 'FWD', y: 74, count: 3 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    label: '4-2-3-1',
    note: 'Double pivot with a free number ten behind the striker.',
    rows: [
      { key: 'gk', role: 'GK', y: 10, count: 1 },
      { key: 'def', role: 'DEF', y: 28, count: 4 },
      { key: 'pivot', role: 'MID', y: 44, count: 2 },
      { key: 'band', role: 'MID', y: 60, count: 3 },
      { key: 'att', role: 'FWD', y: 78, count: 1 },
    ],
  },
  '3-4-3': {
    id: '3-4-3',
    label: '3-4-3',
    note: 'Back three with wing-backs and a front three.',
    rows: [
      { key: 'gk', role: 'GK', y: 11, count: 1 },
      { key: 'def', role: 'DEF', y: 30, count: 3 },
      { key: 'mid', role: 'MID', y: 52, count: 4 },
      { key: 'att', role: 'FWD', y: 74, count: 3 },
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    label: '4-4-2',
    note: 'Classic two banks of four with a strike partnership.',
    rows: [
      { key: 'gk', role: 'GK', y: 11, count: 1 },
      { key: 'def', role: 'DEF', y: 30, count: 4 },
      { key: 'mid', role: 'MID', y: 52, count: 4 },
      { key: 'att', role: 'FWD', y: 74, count: 2 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    label: '3-5-2',
    note: 'Five across the middle to overload the flanks.',
    rows: [
      { key: 'gk', role: 'GK', y: 11, count: 1 },
      { key: 'def', role: 'DEF', y: 30, count: 3 },
      { key: 'mid', role: 'MID', y: 52, count: 5 },
      { key: 'att', role: 'FWD', y: 74, count: 2 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    label: '5-3-2',
    note: 'Deep block: three centre-backs plus two wing-backs.',
    rows: [
      { key: 'gk', role: 'GK', y: 11, count: 1 },
      { key: 'def', role: 'DEF', y: 29, count: 5 },
      { key: 'mid', role: 'MID', y: 53, count: 3 },
      { key: 'att', role: 'FWD', y: 75, count: 2 },
    ],
  },
  '4-1-4-1': {
    id: '4-1-4-1',
    label: '4-1-4-1',
    note: 'A lone screen in front of the back four.',
    rows: [
      { key: 'gk', role: 'GK', y: 10, count: 1 },
      { key: 'def', role: 'DEF', y: 26, count: 4 },
      { key: 'screen', role: 'MID', y: 41, count: 1 },
      { key: 'mid', role: 'MID', y: 57, count: 4 },
      { key: 'att', role: 'FWD', y: 76, count: 1 },
    ],
  },
};

export const FORMATION_IDS: readonly FormationId[] = Object.keys(FORMATION_LAYOUTS) as FormationId[];
export const DEFAULT_FORMATION: FormationId = '4-3-3';

/**
 * Accepts `4-3-3`, `433`, ` 4 - 2 - 3 - 1 `, an Arabic-Indic variant or a line
 * count list; anything unknown (or a formation we do not draw) falls back to the
 * default, so the pitch always renders a real shape.
 */
export function normalizeFormation(value: unknown): FormationId {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_FORMATION;
  const digits = value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .match(/\d/g);
  if (!digits) return DEFAULT_FORMATION;
  const candidate = digits.join('-') as FormationId;
  return FORMATION_IDS.includes(candidate) ? candidate : DEFAULT_FORMATION;
}

export function formationLayout(formation: unknown): FormationLayout {
  return FORMATION_LAYOUTS[normalizeFormation(formation)];
}

/** How many outfield lines a formation has (keeper excluded). */
export function outfieldRowCount(formation: unknown): number {
  return formationLayout(formation).rows.filter((row) => row.role !== 'GK').length;
}

/**
 * The `x` centres of a row: symmetric around 50, spread as wide as the playable
 * band allows, and never closer than `MIN_NODE_GAP`.
 */
export function rowPositions(count: number): number[] {
  const total = Math.max(1, Math.trunc(count));
  if (total === 1) return [50];
  const usable = PITCH.maxX - PITCH.minX;
  const naturalGap = usable / (total - 1);
  const gap = Math.max(PITCH.minNodeGap, naturalGap);
  const span = gap * (total - 1);
  const start = 50 - span / 2;
  return Array.from({ length: total }, (_, index) => Number((start + gap * index).toFixed(2)));
}

/** Every slot of a formation, row by row (keeper first). */
export interface FormationSlot {
  rowKey: string;
  rowIndex: number;
  role: LineRole;
  slotIndex: number;
  x: number;
  y: number;
}

export function formationSlots(formation: unknown): FormationSlot[] {
  const layout = formationLayout(formation);
  const slots: FormationSlot[] = [];
  layout.rows.forEach((row, rowIndex) => {
    rowPositions(row.count).forEach((x, slotIndex) => {
      slots.push({ rowKey: row.key, rowIndex, role: row.role, slotIndex, x, y: row.y });
    });
  });
  return slots;
}

const ROLE_TOKENS: Record<string, LineRole> = {
  GK: 'GK', G: 'GK', GOAL: 'GK', GOALKEEPER: 'GK', KEEPER: 'GK',
  DEF: 'DEF', DF: 'DEF', D: 'DEF', BACK: 'DEF', DEFENDER: 'DEF', DEFENCE: 'DEF', DEFENSE: 'DEF',
  CB: 'DEF', LCB: 'DEF', RCB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF', SW: 'DEF',
  MID: 'MID', MF: 'MID', M: 'MID', CM: 'MID', LCM: 'MID', RCM: 'MID', DM: 'MID', CDM: 'MID',
  AM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', MIDFIELD: 'MID', MIDFIELDER: 'MID',
  FWD: 'FWD', FW: 'FWD', F: 'FWD', ST: 'FWD', CF: 'FWD', LS: 'FWD', RS: 'FWD', SS: 'FWD',
  LW: 'FWD', RW: 'FWD', W: 'FWD', WING: 'FWD', WINGER: 'FWD', STRIKER: 'FWD', FORWARD: 'FWD', ATTACKER: 'FWD',
};

/**
 * Normalizes a raw role string to a formation line (null when unknown).
 *
 * Handles the three shapes the providers actually send: the short code (`GK`,
 * `CDM`), the spelled-out position (`Goalkeeper`, `Left Back`, `Right Winger`)
 * and the hyphenated stats label (`Center-Forward`). Word order does not matter:
 * the first token that maps wins, and "Back"/"Midfield"/"Forward" act as the
 * fallback for the phrase.
 */
export function normalizeRole(value: unknown): LineRole | null {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!raw) return null;
  if (ROLE_TOKENS[raw]) return ROLE_TOKENS[raw];
  const tokens = raw.split(/[^A-Z]+/).filter(Boolean);
  for (const token of tokens) {
    if (ROLE_TOKENS[token]) return ROLE_TOKENS[token];
  }
  return null;
}

export interface LineupPlayer {
  name?: string | null;
  role?: string | null;
  /** Position label the provider sends ("Right Back", "Left Winger"). */
  position?: string | null;
  number?: number | string | null;
  jersey?: number | string | null;
  rating?: number | string | null;
  stats?: { rating?: number | string | null } | null;
  /** Any of these render as a real cutout; otherwise a silhouette is drawn. */
  photo?: string | null;
  cutout?: string | null;
  image?: string | null;
  portrait?: string | null;
}

export interface PlacedPlayer {
  player: LineupPlayer;
  name: string;
  role: LineRole;
  rowKey: string;
  rowIndex: number;
  slotIndex: number;
  x: number;
  y: number;
  /** Shirt number shown in the badge (1–99). */
  number: string;
  /** Rating shown in the popup, or null when nobody reported one. */
  rating: string | null;
  /** Label already truncated to the row gap (never overlaps the next node). */
  label: string;
  /** True for the first player of the row — used for row-level a11y labels. */
  rowStart: boolean;
}

/** Jersey numbers used when the provider does not send one, per line. */
const NUMBER_BY_SLOT: Record<LineRole, number[]> = {
  GK: [1],
  DEF: [2, 5, 4, 3, 15],
  MID: [6, 8, 10, 14, 16],
  FWD: [7, 9, 11, 17, 19],
};

/** Football-accurate default numbers, honouring a real shirt number first. */
export function playerNumber(player: LineupPlayer | null | undefined, role: LineRole, slotIndex: number): string {
  const raw = player?.number ?? player?.jersey;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return String(Math.min(99, Math.trunc(parsed)));
  const pool = NUMBER_BY_SLOT[role] ?? NUMBER_BY_SLOT.MID;
  return String(pool[slotIndex % pool.length]);
}

/** A rating when one was reported (0–10), else null — never invented. */
export function playerRating(player: LineupPlayer | null | undefined): string | null {
  const raw = player?.rating ?? player?.stats?.rating;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const rounded = Math.min(10, parsed);
  return rounded.toFixed(rounded % 1 === 0 ? 1 : 2);
}

/** The best readable name we have for a player. */
export function playerName(player: LineupPlayer | null | undefined, fallback = 'Player'): string {
  const raw = typeof player?.name === 'string' ? player.name.trim() : '';
  return raw || fallback;
}

/**
 * Characters that fit on one label line inside a row gap. Two nodes are `gap`
 * apart, so each may claim `gap - 2` units of width (1 unit of padding either
 * side) — with a floor of 3 so a label can still read "GK".
 */
export function maxLabelChars(gap: number): number {
  const safeGap = Number.isFinite(gap) ? Math.max(PITCH.minNodeGap, gap) : PITCH.minNodeGap;
  return Math.max(3, Math.floor((safeGap - 2) / PITCH.labelCharWidth));
}

/**
 * Short label that cannot collide: the longest tail of the name that fits, so
 * "Ødegaard" becomes "degaard"/"gaard"/"ard" rather than an ellipsis.
 */
export function clipLabel(name: unknown, limit: number): string {
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!clean) return '—';
  const safe = Math.max(3, Math.trunc(limit));
  return clean.length <= safe ? clean : clean.slice(-safe);
}

/** `clipLabel` with the limit derived from the row gap. */
export function labelFor(name: unknown, gap: number): string {
  return clipLabel(name, maxLabelChars(gap));
}

/**
 * Places a player list on a formation.
 *
 * Rules that make the grid behave:
 *   • A player goes to his own line (GK → keeper row, DEF → back row, …). A
 *     provider that sends two strikers in a one-striker shape still gets them
 *     both onto the same line: the row grows evenly instead of stacking nodes.
 *   • A line that fits its formation slots keeps the authentic slot `x`
 *     positions (so a 4-2-3-1 reads like one), and a line with extra players
 *     re-spreads evenly — never closer than `MIN_NODE_GAP`.
 *   • `(rowKey, slotIndex)` is unique, so React keys, row guides and the roster
 *     list can never alias two players onto one node.
 *   • The label is truncated against **both** neighbours: the row below and the
 *     nearest team-mate on the same line.
 */
export function placePlayers(formation: unknown, players?: readonly LineupPlayer[] | null): PlacedPlayer[] {
  const layout = formationLayout(formation);
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const source = list.length ? list : [];
  const rows = layout.rows;

  /** row.key → players assigned to that line, in the order they arrived. */
  const assignments = new Map<string, LineupPlayer[]>();
  const roleRowIndex = (role: LineRole) => rows.findIndex((row) => row.role === role);

  if (!source.length) {
    // Nothing sent: draw the formation's own placeholder shirts.
    rows.forEach((row) => {
      assignments.set(
        row.key,
        Array.from({ length: row.count }, (_, slotIndex) => ({ name: placeholderName(row.role, slotIndex) }))
      );
    });
  } else {
    let cursor = 0;
    for (const player of source) {
      const explicit = normalizeRole(player?.role) ?? normalizeRole(player?.position);
      const fallbackRole = rows[Math.min(cursor, rows.length - 1)]?.role ?? 'MID';
      const role: LineRole = explicit ?? fallbackRole;
      const row = rows.find((candidate) => candidate.role === role) ?? rows[roleRowIndex('MID')] ?? rows[rows.length - 1];
      const bucket = assignments.get(row.key) ?? [];
      bucket.push(player);
      assignments.set(row.key, bucket);
      if (!explicit) cursor += 1;
    }
  }

  const placed: PlacedPlayer[] = [];
  rows.forEach((row, rowIndex) => {
    const bucket = assignments.get(row.key) ?? [];
    if (!bucket.length) return;
    const xs = bucket.length <= row.count ? rowPositions(row.count).slice(0, bucket.length) : rowPositions(bucket.length);
    const vertical = rowGap(layout, rowIndex);
    bucket.forEach((player, slotIndex) => {
      const x = xs[slotIndex];
      const neighbours = xs
        .map((candidate, index) => (index === slotIndex ? Infinity : Math.abs(candidate - x)))
        .reduce((min, distance) => Math.min(min, distance), Infinity);
      const labelLimit = Math.min(
        maxLabelChars(vertical),
        Number.isFinite(neighbours) ? Math.max(3, Math.floor((neighbours - 2) / PITCH.labelCharWidth)) : 99
      );
      const role = normalizeRole(player?.role) ?? normalizeRole(player?.position) ?? row.role;
      placed.push({
        player,
        name: playerName(player),
        role: row.role,
        rowKey: row.key,
        rowIndex,
        slotIndex,
        x,
        y: row.y,
        number: playerNumber(player, role, slotIndex),
        rating: playerRating(player),
        label: clipLabel(playerName(player), labelLimit),
        rowStart: slotIndex === 0,
      });
    });
  });

  return placed;
}

/** Distance to the next row (the space a label may use), keeper rows included. */
export function rowGap(layout: FormationLayout, rowIndex: number): number {
  const rows = layout.rows;
  const current = rows[rowIndex];
  const next = rows[rowIndex + 1];
  const previous = rows[rowIndex - 1];
  const gaps = [next ? next.y - current.y : Infinity, previous ? current.y - previous.y : Infinity];
  const nearest = Math.min(...gaps);
  return Number.isFinite(nearest) ? nearest : PITCH.minRowGap;
}

const PLACEHOLDER: Record<LineRole, string[]> = {
  GK: ['GK'],
  DEF: ['LB', 'LCB', 'RCB', 'RB', 'LWB'],
  MID: ['DM', 'CM', 'AM', 'LM', 'RM'],
  FWD: ['LW', 'ST', 'RW', 'CF', 'SS'],
};

function placeholderName(role: LineRole, slotIndex: number): string {
  const pool = PLACEHOLDER[role] ?? PLACEHOLDER.MID;
  return pool[slotIndex % pool.length];
}

/** The cutout URL the popup should try first (null → silhouette). */
export function cutoutUrl(player: LineupPlayer | null | undefined): string | null {
  const candidate = player?.cutout ?? player?.photo ?? player?.image ?? player?.portrait;
  if (typeof candidate !== 'string') return null;
  const url = candidate.trim();
  if (!/^https?:\/\//i.test(url) && !/^\//.test(url) && !url.startsWith('data:image/')) return null;
  return url;
}

/** Roster rows for the list under the pitch (used by the a11y table too). */
export function rosterRows(placed: readonly PlacedPlayer[]): PlacedPlayer[] {
  return placed.slice().sort((a, b) => (a.rowIndex - b.rowIndex) || (a.slotIndex - b.slotIndex));
}
