/**
 * Club colour helpers for the club page hero. Official colours come from
 * ESPN (`color` / `alternateColor`, hex without '#'); light kits (white,
 * yellow) are deepened so white hero text always keeps its contrast.
 */

export function normalizeHex(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((c) => c + c).join('').toLowerCase()}`;
  return null;
}

function toRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear mix: `t = 0` → a, `t = 1` → b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const BRAND_DEEP = '#18030a';
const BRAND_SURFACE = '#572339';

export interface HeroPalette {
  /** Gradient start (always dark enough for white text). */
  from: string;
  /** Gradient end. */
  to: string;
  /** Raw official colours for swatches (may be light). */
  swatches: string[];
}

/** Builds a readable hero gradient from a club's official colours. */
export function heroPalette(color?: string | null, alternate?: string | null): HeroPalette {
  const primary = normalizeHex(color);
  const secondary = normalizeHex(alternate);
  const swatches = [primary, secondary].filter((c, i, list): c is string => Boolean(c) && list.indexOf(c) === i);
  if (!primary && !secondary) return { from: BRAND_SURFACE, to: BRAND_DEEP, swatches };

  // Lead with the darker of the two official colours.
  const ordered = [primary, secondary].filter(Boolean) as string[];
  ordered.sort((a, b) => luminance(a) - luminance(b));
  const base = ordered[0];
  const other = ordered[1] ?? base;

  const deepen = (hex: string, maxLum: number) => {
    let out = hex;
    for (let step = 0; step < 6 && luminance(out) > maxLum; step += 1) out = mixHex(out, BRAND_DEEP, 0.3);
    return out;
  };

  return {
    from: deepen(base, 0.18),
    to: deepen(mixHex(other, BRAND_DEEP, 0.55), 0.08),
    swatches,
  };
}

/** "r g b" triplet for CSS custom properties (`rgb(var(--x) / 0.4)`), or null. */
export function rgbTriplet(value: string | null | undefined): string | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  return toRgb(hex).join(' ');
}

/**
 * Tint for the glow inside a liquid-glass crest: very dark kit colours are
 * lifted towards white so the caustic glow stays visible on dark glass.
 */
export function dropTint(value: string | null | undefined): string | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  return rgbTriplet(luminance(hex) < 0.06 ? mixHex(hex, '#ffffff', 0.4) : hex);
}
