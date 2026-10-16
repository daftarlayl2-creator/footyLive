/**
 * High-resolution, transparent player cutouts (Transfermarkt-style).
 *
 * The /player/[id] card must show a genuine action cutout — a transparent PNG
 * with no opaque backdrop and no circular crop — not a generic placeholder.
 *
 * Ordering rules (highest value first):
 *   1. the provider's **action render** (largest transparent PNG: player cut out
 *      of a match photo, arms/legs in motion),
 *   2. the provider's **cutout** (transparent 3/4 bust),
 *   3. ESPN's full-size transparent PNG headshot, and a 1024-px combiner variant
 *      of the same file for large screens.
 *
 * Only `.png` files are accepted (the providers' opaque `.jpg` / `.webp` thumbs
 * are what produced the old "generic circular placeholder" look), and the
 * TheSportsDB hosts are pinned so a poisoned search result can never point the
 * card at an arbitrary origin.
 */
import type { PlayerPortrait, PlayerProfile } from './types';
import { safePlayerImage } from './normalize';

/** Transparent PNGs live on TheSportsDB's media CDN only. */
export const SPORTSDB_MEDIA_HOST_RE = /(^|\.)thesportsdb\.com$/i;

/** Render = action cutout (biggest), cutout = bust, both transparent PNGs. */
export const CUTOUT_KINDS: ReadonlyArray<PlayerPortrait['kind']> = ['cutout'];

/**
 * Extra search terms for the players fans look up most, so a lookup lands on
 * the right identity even when the provider files them under a longer name.
 * Identity is still verified against the date of birth — an alias only widens
 * the search, never the trust.
 */
export const CUTOUT_ALIASES: Record<string, string[]> = {
  'lamine yamal': ['Lamine Yamal Nasraoui Ebana', 'Lamine Yamal'],
  pedri: ['Pedro González López', 'Pedri'],
  'vinicius junior': ['Vinícius Júnior', 'Vinicius Jose Paixao de Oliveira Junior'],
  'kylian mbappe': ['Kylian Mbappé Lottin', 'Kylian Mbappe'],
  'erling haaland': ['Erling Braut Haaland', 'Erling Haaland'],
  'jude bellingham': ['Jude Victor William Bellingham', 'Jude Bellingham'],
  'michael olise': ['Michael Akpovie Olise', 'Michael Olise'],
  'pau cubarsi': ['Pau Cubarsí Paredes', 'Pau Cubarsi'],
  'desire doue': ['Désiré Doué', 'Desire Doue'],
  'bukayo saka': ['Bukayo Ayoyinka Temidayo Saka', 'Bukayo Saka'],
  rodri: ['Rodrigo Hernández Cascante', 'Rodri'],
};

const fold = (value: unknown) => typeof value === 'string'
  ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  : '';

/**
 * Search terms to try, in order: the provider's display name (the most likely
 * hit), the curated aliases, then the full legal name.
 */
export function cutoutSearchTerms(player: Pick<PlayerProfile, 'name' | 'fullName'>): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (value?: string | null) => {
    const term = typeof value === 'string' ? value.trim() : '';
    if (!term) return;
    const key = fold(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  };
  add(player.name);
  for (const alias of CUTOUT_ALIASES[fold(player.name)] || []) add(alias);
  add(player.fullName);
  return terms.slice(0, 4);
}

/** True when the URL is a transparent PNG on an allow-listed cutout host. */
export function isTransparentCutoutUrl(value: unknown): boolean {
  const url = safePlayerImage(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!/\.png$/i.test(parsed.pathname)) return false;
    // Opaque thumbnails are the classic source of "circular placeholder" art.
    if (/\/(?:thumb|small|tiny|mini)\//i.test(parsed.pathname)) return false;
    return SPORTSDB_MEDIA_HOST_RE.test(parsed.hostname) || /(^|\.)espncdn\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** 1024-px variant of ESPN's transparent soccer headshot for large screens. */
export function highResEspnHeadshot(id: string): string | undefined {
  if (!/^\d{1,10}$/.test(id)) return undefined;
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${id}.png&w=1024&h=1024`;
}

/**
 * Best cutout for a player, in priority order. Used by the showcase card and by
 * any compact surface that wants a real face instead of a shirt tile.
 */
export function preferredCutout(portraits: PlayerPortrait[] | null | undefined): PlayerPortrait | null {
  for (const portrait of portraits || []) {
    if (portrait?.kind !== 'cutout') continue;
    if (isTransparentCutoutUrl(portrait.src)) return portrait;
  }
  return null;
}

/** Ordered candidates with the transparent, highest-resolution art first. */
export function orderPortraits(portraits: PlayerPortrait[]): PlayerPortrait[] {
  const weight = (portrait: PlayerPortrait) => (portrait.kind === 'cutout' ? 0 : portrait.kind === 'headshot' ? 1 : 2);
  return [...portraits].sort((a, b) => weight(a) - weight(b));
}
