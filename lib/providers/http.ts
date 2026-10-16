/**
 * Shared JSON fetch for public data APIs (Wikipedia, Wikidata, TheSportsDB…):
 * hard timeout, Next.js data-cache revalidation and an identifying
 * User-Agent (required by the Wikimedia API etiquette).
 */

export const APP_USER_AGENT = 'LimonLive/1.0 (+https://github.com/daftarlayl2-creator/footyLive)';

export interface FetchJsonOptions {
  /** Next.js data-cache lifetime in seconds. */
  revalidate?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchJson<T = any>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { revalidate = 300, timeoutMs = 7000, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': APP_USER_AGENT,
        'Api-User-Agent': APP_USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
      next: { revalidate },
    } as RequestInit & { next?: { revalidate: number } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
