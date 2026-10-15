import { getCacheManager } from '../cache/cacheManager';

export interface HighlightVideo {
  id: string;
  title: string;
  embed: string;
  url?: string;
}

export interface Highlight {
  id: string;
  title: string;
  matchTitle?: string;
  thumbnailUrl?: string;
  embedCode?: string;
  url?: string;
  competition: string;
  date: string;
  thumbnail: string;
  homeTeam: string;
  awayTeam: string;
  videos: HighlightVideo[];
  embed: string;
}

const SCOREBAT_URL = 'https://www.scorebat.com/video-api/v3/feed/';

/** Hard deadline for the upstream request and for the whole provider call. */
export const SCOREBAT_TIMEOUT_MS = 3_000;

/** ScoreBat rejects bare UA strings; a browser UA plus JSON Accept works. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function splitTeams(title: string): { home: string; away: string } {
  // Whole-word separators only ("vs", "v", "x") and spaced dashes — never
  // letters inside names ("Arsenal" must not split on its "s") and never
  // hyphens inside names ("Paris Saint-Germain" stays intact).
  const vsSplit = String(title || '').split(/\s+(?:vs\.?|v|x)\s+|\s+[-–—]\s+/i);
  if (vsSplit.length >= 2) {
    // First two segments are the teams; anything after is a date/round suffix.
    return { home: vsSplit[0].trim(), away: vsSplit[1].trim() };
  }
  return { home: title || '', away: '' };
}

function normalize(item: any, index: number): Highlight {
  const title = item?.title || item?.match || '';
  const { home, away } = splitTeams(title);
  const videos: HighlightVideo[] = Array.isArray(item?.videos)
    ? item.videos.map((v: any, i: number) => ({
        id: String(v?.id ?? `${index}-${i}`),
        title: v?.title || 'Highlights',
        embed: v?.embed || v?.embedCode || '',
        url: v?.url,
      }))
    : [];
  const embed = videos.length ? videos[0].embed : item?.embed || '';
  return {
    id: String(item?.id ?? item?.matchId ?? index),
    title,
    matchTitle: title,
    competition: item?.competition?.name || item?.competition || '',
    date: item?.date || item?.utcDate || '',
    thumbnail: item?.thumbnail || item?.image || '',
    thumbnailUrl: item?.thumbnail || item?.image || '',
    homeTeam: home,
    awayTeam: away,
    videos,
    embed,
    embedCode: embed,
    url: videos.length ? videos[0].url : item?.url,
  };
}

async function fetchScoreBat(): Promise<Highlight[]> {
  const res = await fetch(SCOREBAT_URL, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
    cache: 'no-store',
    // Never let ScoreBat hold the request open: the API route and the UI both
    // give up after three seconds and fall back to "No recent highlights".
    signal: AbortSignal.timeout(SCOREBAT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data?.response)
    ? data.response
    : Array.isArray(data)
      ? data
      : data?.response?.items || [];
  return raw.map(normalize);
}

/**
 * Resolve `promise` within `ms`, falling back to `fallback` on timeout.
 * Late rejections are swallowed so they never become unhandled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    promise.catch(() => {});
  }
}

/**
 * Recent highlights, always resolved within `SCOREBAT_TIMEOUT_MS`. A slow or
 * failing upstream degrades to an empty list instead of hanging the request.
 */
export async function getHighlights(): Promise<Highlight[]> {
  const cache = getCacheManager();
  return withTimeout(
    cache.swr('scorebat_highlights', fetchScoreBat, 15 * 60),
    SCOREBAT_TIMEOUT_MS,
    [] as Highlight[]
  );
}

export const fetchHighlights = getHighlights;
export const getScoreBatHighlights = getHighlights;
export const highlightsProvider = { get: getHighlights, fetchHighlights, getScoreBatHighlights };

export default highlightsProvider;
