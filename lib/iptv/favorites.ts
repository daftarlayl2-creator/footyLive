/**
 * IPTV channel favorites — pure helpers around a JSON string list.
 * Persistence uses the existing device-local storage pattern
 * (`useLocalValue` / `writeLocal`), matching team favorites; signed-in
 * cross-device sync is not part of the existing favorites architecture.
 */

export const IPTV_FAVORITES_KEY = 'limon-iptv-favorites';
const MAX_FAVORITES = 500;

export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0))].slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function serializeFavorites(ids: string[]): string {
  return JSON.stringify([...new Set(ids)].slice(0, MAX_FAVORITES));
}

export function toggleFavorite(ids: string[], id: string): string[] {
  if (!id) return ids;
  return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id].slice(0, MAX_FAVORITES);
}
