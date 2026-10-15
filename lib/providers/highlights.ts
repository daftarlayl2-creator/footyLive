import { getCacheManager } from '../cache/cacheManager';
import logger from '../logger';

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

function splitTeams(title: string): { home: string; away: string } {
  const parts = String(title || '').split(/\s*[-–—vsx]+\s*/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { home: parts[0], away: parts[parts.length - 1] };
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
  const res = await fetch(SCOREBAT_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data?.response)
    ? data.response
    : Array.isArray(data)
      ? data
      : data?.response?.items || [];
  return raw.map(normalize);
}

export async function getHighlights(): Promise<Highlight[]> {
  const cache = getCacheManager();
  return cache.swr('scorebat_highlights', fetchScoreBat, 15 * 60);
}

export const fetchHighlights = getHighlights;
export const getScoreBatHighlights = getHighlights;
export const highlightsProvider = { get: getHighlights, fetchHighlights, getScoreBatHighlights };

export default highlightsProvider;
