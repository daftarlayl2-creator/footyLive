/**
 * Club page URLs: `/club/{espnId}-{slug}` when the ESPN team id is known
 * (`/club/359-arsenal`), otherwise `/club/{slug}` (`/club/maghreb-de-fes`),
 * which the club page resolves by name.
 */

export interface ClubRef {
  id?: string | number | null;
  name?: string | null;
}

export interface ParsedClubParam {
  espnId: string | null;
  slug: string;
}

/** URL-safe, accent-free slug: "Brighton & Hove Albion" → "brighton-and-hove-albion". */
export function slugifyClubName(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function numericId(id: ClubRef['id']): string | null {
  if (id === null || id === undefined) return null;
  const value = String(id).trim();
  return /^\d{1,9}$/.test(value) ? value : null;
}

/** Club page href, or `null` when there is nothing to link to. */
export function clubHref(club: ClubRef | null | undefined): string | null {
  if (!club) return null;
  const id = numericId(club.id);
  const slug = slugifyClubName(club.name);
  if (id) return `/club/${id}${slug ? `-${slug}` : ''}`;
  return slug ? `/club/${slug}` : null;
}

/** Parses the `[id]` route segment back into an ESPN id and/or name slug. */
export function parseClubParam(param: string | null | undefined): ParsedClubParam {
  let raw = String(param ?? '').trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  const match = /^(\d{1,9})(?:-(.*))?$/.exec(raw);
  if (match) return { espnId: match[1], slug: slugifyClubName(match[2] ?? '') };
  return { espnId: null, slug: slugifyClubName(raw) };
}

/** "brighton-and-hove-albion" → "brighton and hove albion" (for name searches). */
export function nameFromSlug(slug: string): string {
  return slug.replace(/-+/g, ' ').trim();
}
