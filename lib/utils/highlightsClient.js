/**
 * Client-side highlights fetching with a hard deadline.
 *
 * The UI must NEVER stay stuck on "Loading highlights…": this helper always
 * resolves within `HIGHLIGHTS_FETCH_TIMEOUT_MS` — with the fetched list when
 * the API answers in time, or with an empty list on timeout / any error.
 */

export const HIGHLIGHTS_FETCH_TIMEOUT_MS = 3_000;

/**
 * Fetch `/api/highlights`, bounded by a 3-second client timeout.
 * Never rejects: returns `[]` on timeout, network errors or bad payloads.
 */
export async function fetchHighlightsSafely(fetchImpl = fetch, timeoutMs = HIGHLIGHTS_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl('/api/highlights', { cache: 'no-store', signal: controller.signal });
    const data = await res.json();
    return Array.isArray(data?.highlights) ? data.highlights : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
