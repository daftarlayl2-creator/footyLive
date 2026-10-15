/**
 * Player portraits for the /player/[id] card — real provider images only.
 *
 *  - Featured (showcase) players lead with a high-resolution transparent
 *    cutout from TheSportsDB (`strCutout`, then the full-body `strRender`).
 *  - Everyone else leads with ESPN's own headshot (also a transparent PNG);
 *    TheSportsDB is consulted only when ESPN has no headshot.
 *  - Then ESPN's id-pattern headshot (published for many players the athlete
 *    payload omits) and, last, TheSportsDB's non-transparent photo thumb.
 *
 * The banner walks this list on image errors and ends on a branded
 * silhouette. A TheSportsDB hit must be a soccer player with the same date of
 * birth (or an unambiguous exact name when no birth date is known), so a
 * namesake never lends their face.
 */
import { fetchJson } from '@/lib/providers/http';
import { getCacheManager } from '@/lib/cache/cacheManager';
import { safePlayerImage } from './normalize';
import type { PlayerPortrait, PlayerProfile } from './types';

/** TheSportsDB v1 (free tier key unless one is configured). */
export const SPORTSDB_PLAYER_API = `https://www.thesportsdb.com/api/v1/json/${process.env.THESPORTSDB_API_KEY || '123'}`;
const PORTRAIT_TTL_S = 24 * 60 * 60;
const LOOKUP_TIMEOUT_MS = 3_000;

export interface SportsDbPlayer {
  idPlayer?: string;
  strPlayer?: string;
  strPlayerAlternate?: string | null;
  strSport?: string;
  dateBorn?: string | null;
  strCutout?: string | null;
  strRender?: string | null;
  strThumb?: string | null;
}

export interface SportsDbImages {
  cutout?: string;
  render?: string;
  thumb?: string;
}

const fold = (value: unknown) => typeof value === 'string'
  ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  : '';

/** The search hit that is provably the same footballer, or null. */
export function pickSportsDbPlayer(json: unknown, player: Pick<PlayerProfile, 'name' | 'fullName' | 'dateOfBirth'>): SportsDbPlayer | null {
  const list = (json as { player?: unknown })?.player;
  const soccer = (Array.isArray(list) ? list : []).filter((hit): hit is SportsDbPlayer => Boolean(hit) && (hit as SportsDbPlayer).strSport === 'Soccer');
  const dob = typeof player.dateOfBirth === 'string' ? player.dateOfBirth.slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return soccer.find((hit) => hit.dateBorn === dob) ?? null;
  }
  // No birth date to compare: only an exact, unambiguous name.
  const names = new Set([player.name, player.fullName].map(fold).filter(Boolean));
  const exact = soccer.filter((hit) => [hit.strPlayer, hit.strPlayerAlternate].some((name) => names.has(fold(name))));
  return exact.length === 1 ? exact[0] : null;
}

/** HTTPS images on TheSportsDB's own hosts only. */
export function sportsDbImages(hit: SportsDbPlayer | null | undefined): SportsDbImages {
  const image = (value: unknown) => {
    const url = safePlayerImage(value);
    if (!url) return undefined;
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && /(^|\.)thesportsdb\.com$/i.test(hostname) ? url : undefined;
  };
  if (!hit) return {};
  const images: SportsDbImages = {};
  const cutout = image(hit.strCutout);
  const render = image(hit.strRender);
  const thumb = image(hit.strThumb);
  if (cutout) images.cutout = cutout;
  if (render) images.render = render;
  if (thumb) images.thumb = thumb;
  return images;
}

/** ESPN's soccer headshot path for an athlete id (a transparent PNG when published). */
export function espnHeadshotUrl(id: string): string | undefined {
  return /^\d{1,10}$/.test(id) ? `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png` : undefined;
}

/** Ordered, de-duplicated portrait candidates for the banner. */
export function buildPortraitSources(player: Pick<PlayerProfile, 'id' | 'portrait' | 'featured'>, sportsDb: SportsDbImages | null = null): PlayerPortrait[] {
  const espn: PlayerPortrait[] = player.portrait ? [{ src: player.portrait, kind: 'headshot', credit: 'ESPN' }] : [];
  const cutouts: PlayerPortrait[] = [
    ...(sportsDb?.cutout ? [{ src: sportsDb.cutout, kind: 'cutout' as const, credit: 'TheSportsDB' as const }] : []),
    ...(sportsDb?.render ? [{ src: sportsDb.render, kind: 'cutout' as const, credit: 'TheSportsDB' as const }] : []),
  ];
  const pattern = espnHeadshotUrl(player.id);
  const ordered: PlayerPortrait[] = [
    ...(player.featured ? [...cutouts, ...espn] : [...espn, ...cutouts]),
    ...(pattern ? [{ src: pattern, kind: 'headshot' as const, credit: 'ESPN' as const }] : []),
    ...(sportsDb?.thumb ? [{ src: sportsDb.thumb, kind: 'photo' as const, credit: 'TheSportsDB' as const }] : []),
  ];
  const seen = new Set<string>();
  return ordered.filter(({ src }) => (seen.has(src) ? false : (seen.add(src), true)));
}

async function searchSportsDb(name: string): Promise<unknown> {
  return fetchJson(`${SPORTSDB_PLAYER_API}/searchplayers.php?p=${encodeURIComponent(name)}`, {
    revalidate: PORTRAIT_TTL_S,
    timeoutMs: LOOKUP_TIMEOUT_MS,
  });
}

/** Cached (24 h) TheSportsDB images for one player; outages are not cached. */
export async function lookupSportsDbImages(player: Pick<PlayerProfile, 'id' | 'name' | 'fullName' | 'dateOfBirth'>): Promise<SportsDbImages> {
  return getCacheManager().swr(`player:portrait:v1:${player.id}`, async () => {
    let hit = pickSportsDbPlayer(await searchSportsDb(player.name), player);
    if (!hit && player.fullName && fold(player.fullName) !== fold(player.name)) {
      hit = pickSportsDbPlayer(await searchSportsDb(player.fullName), player);
    }
    return sportsDbImages(hit);
  }, PORTRAIT_TTL_S);
}

/** Attach portrait candidates; never fails the profile when the lookup does. */
export async function withPortraits(
  player: PlayerProfile,
  lookup: (player: PlayerProfile) => Promise<SportsDbImages> = lookupSportsDbImages,
): Promise<PlayerProfile> {
  const needsLookup = Boolean(player.featured) || !player.portrait;
  const sportsDb = needsLookup ? await lookup(player).catch(() => null) : null;
  return { ...player, portraits: buildPortraitSources(player, sportsDb) };
}
