/**
 * Fan country selector: country list, CSS flag art and age helpers.
 *
 * Flags are pure data — direction + weighted stripes (+ an optional emblem
 * glyph) — so `flagCss()` can paint any of them as a `linear-gradient` and the
 * WavingFlag component animates it without shipping flag images. Pseudo-codes
 * for the home nations (England / Scotland / Wales) are football-first
 * shortcuts next to the ISO codes.
 */

export type FlagDirection = 'h' | 'v';
export type Stripe = string | readonly [color: string, weight: number];

export interface Country {
  /** ISO 3166-1 alpha-2 (uppercase) or a home-nation pseudo-code. */
  code: string;
  name: string;
  dir: FlagDirection;
  stripes: readonly Stripe[];
  /** Centered emblem glyph painted over the stripes (crescent, star, disc…). */
  emblem?: string;
  emblemColor?: string;
}

const C = (code: string, name: string, dir: FlagDirection, stripes: readonly Stripe[], emblem?: string, emblemColor?: string): Country =>
  ({ code, name, dir, stripes, ...(emblem ? { emblem, emblemColor: emblemColor || '#FFFFFF' } : {}) });

/** Football-heavy list, Morocco pinned first. */
export const COUNTRIES: readonly Country[] = [
  C('MA', 'Morocco', 'h', ['#C1272D'], '★', '#006233'),
  C('DZ', 'Algeria', 'v', ['#006233', '#FFFFFF'], '☪', '#D21034'),
  C('AR', 'Argentina', 'h', ['#74ACDF', '#FFFFFF', '#74ACDF']),
  C('AT', 'Austria', 'h', ['#EF3340', '#FFFFFF', '#EF3340']),
  C('AU', 'Australia', 'h', ['#012169'], '✶', '#FFCD00'),
  C('BE', 'Belgium', 'v', ['#000000', '#FDDA24', '#EF3340']),
  C('BR', 'Brazil', 'h', ['#009B3A'], '◆', '#FEDF00'),
  C('CM', 'Cameroon', 'v', ['#007A5E', '#CE1126', '#FCD116'], '★', '#FCD116'),
  C('CA', 'Canada', 'v', ['#FF0000', ['#FFFFFF', 2], '#FF0000'], '✱', '#FF0000'),
  C('CL', 'Chile', 'h', ['#FFFFFF', '#D52B1E'], '★', '#0039A6'),
  C('CO', 'Colombia', 'h', [['#FCD116', 2], '#003893', '#CE1126']),
  C('HR', 'Croatia', 'h', ['#FF0000', '#FFFFFF', '#171796']),
  C('CZ', 'Czechia', 'h', ['#FFFFFF', '#D7141A'], '◀', '#11457E'),
  C('CI', "Côte d'Ivoire", 'v', ['#F77F00', '#FFFFFF', '#009E60']),
  C('DK', 'Denmark', 'h', ['#C8102E'], '✚', '#FFFFFF'),
  C('EC', 'Ecuador', 'h', [['#FFDD00', 2], '#034EA2', '#ED1C24']),
  C('EG', 'Egypt', 'h', ['#CE1126', '#FFFFFF', '#000000']),
  C('ENG', 'England', 'h', ['#FFFFFF'], '✚', '#CE1124'),
  C('FR', 'France', 'v', ['#0055A4', '#FFFFFF', '#EF4135']),
  C('DE', 'Germany', 'h', ['#000000', '#DD0000', '#FFCE00']),
  C('GH', 'Ghana', 'h', ['#CE1126', '#FCD116', '#006B3F'], '★', '#000000'),
  C('GR', 'Greece', 'h', ['#0D5EAF', '#FFFFFF', '#0D5EAF', '#FFFFFF', '#0D5EAF']),
  C('HU', 'Hungary', 'h', ['#CD2A3E', '#FFFFFF', '#436F4D']),
  C('IE', 'Ireland', 'v', ['#169B62', '#FFFFFF', '#FF883E']),
  C('IT', 'Italy', 'v', ['#009246', '#FFFFFF', '#CE2B37']),
  C('JP', 'Japan', 'h', ['#FFFFFF'], '●', '#BC002D'),
  C('MX', 'Mexico', 'v', ['#006847', '#FFFFFF', '#CE1126']),
  C('NL', 'Netherlands', 'h', ['#AE1C28', '#FFFFFF', '#21468B']),
  C('NG', 'Nigeria', 'v', ['#008751', '#FFFFFF', '#008751']),
  C('NO', 'Norway', 'h', ['#BA0C2F'], '✚', '#00205B'),
  C('PL', 'Poland', 'h', ['#FFFFFF', '#DC143C']),
  C('PT', 'Portugal', 'v', [['#046A38', 2], ['#DA291C', 3]]),
  C('QA', 'Qatar', 'v', [['#FFFFFF', 1], ['#8A1538', 3]]),
  C('SA', 'Saudi Arabia', 'h', ['#165D31'], '☪', '#FFFFFF'),
  C('SCO', 'Scotland', 'h', ['#0065BF'], '✕', '#FFFFFF'),
  C('SN', 'Senegal', 'v', ['#00853F', '#FDEF42', '#E31B23'], '★', '#00853F'),
  C('RS', 'Serbia', 'h', ['#C6363C', '#0C4076', '#FFFFFF']),
  C('KR', 'South Korea', 'h', ['#FFFFFF'], '◐', '#CD2E3A'),
  C('ES', 'Spain', 'h', ['#AA151B', ['#F1BF00', 2], '#AA151B']),
  C('SE', 'Sweden', 'h', ['#006AA7'], '✚', '#FECC02'),
  C('CH', 'Switzerland', 'h', ['#DA291C'], '✚', '#FFFFFF'),
  C('TN', 'Tunisia', 'h', ['#E70013'], '☪', '#FFFFFF'),
  C('TR', 'Türkiye', 'h', ['#E30A17'], '☪', '#FFFFFF'),
  C('UA', 'Ukraine', 'h', ['#005BBB', '#FFD500']),
  C('GB', 'United Kingdom', 'h', ['#012169'], '✚', '#C8102E'),
  C('US', 'United States', 'h', ['#B22234', '#FFFFFF', '#B22234', '#FFFFFF', '#B22234'], '★', '#3C3B6E'),
  C('UY', 'Uruguay', 'h', ['#FFFFFF', '#0038A8', '#FFFFFF', '#0038A8', '#FFFFFF'], '☀', '#FCD116'),
  C('WAL', 'Wales', 'h', ['#FFFFFF', '#00AB39'], '✦', '#D30731'),
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/** Look up a country by code (case-insensitive); undefined when unknown. */
export function findCountry(code: unknown): Country | undefined {
  if (typeof code !== 'string') return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

/** Every selectable country code (uppercase). */
export const COUNTRY_CODES: readonly string[] = COUNTRIES.map((country) => country.code);

/** True when the code is one a fan may pick. */
export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && BY_CODE.has(value.trim().toUpperCase());
}

/** Normalize a stored/sent code to its canonical uppercase form ('' → null). */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return BY_CODE.has(code) ? code : null;
}

/**
 * The `linear-gradient` painting the flag over its element. Equal-weight
 * stripes unless a `[color, weight]` pair says otherwise.
 */
export function flagCss(country: Country): string {
  const raw = country.stripes.map((stripe) => (Array.isArray(stripe) ? stripe : [stripe, 1] as const));
  const total = raw.reduce((sum, [, weight]) => sum + (Number.isFinite(weight as number) && (weight as number) > 0 ? (weight as number) : 1), 0);
  let cursor = 0;
  const stops = raw.flatMap(([color, weight]) => {
    const clean = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#2A0813';
    const share = ((Number.isFinite(weight as number) && (weight as number) > 0 ? (weight as number) : 1) / total) * 100;
    const from = cursor;
    cursor += share;
    return [`${clean} ${from.toFixed(2)}%`, `${clean} ${Math.min(100, cursor).toFixed(2)}%`];
  });
  const direction = country.dir === 'v' ? '90deg' : '180deg';
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/** Age in full years from an ISO `YYYY-MM-DD` birthdate; null when invalid. */
export function ageFromBirthdate(value: unknown, now: Date = new Date()): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (birth.getTime() > today.getTime()) return null;
  let age = today.getUTCFullYear() - year;
  const hadBirthday = month - 1 < today.getUTCMonth() || (month - 1 === today.getUTCMonth() && day <= today.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}
