import { getEspnMatches } from './providers/espn';
import { getLeaguePriority } from './utils/matching';
import type { Match } from './types';

export interface HeroBanner {
  competition: string;
  headline?: string;
  background?: string;
  image?: string;
  imageUrl?: string;
  backgroundUrl?: string;
  bg?: string;
  tagline: string;
  title: string;
  subtitle: string;
  backgroundImage: string;
  badge: string;
  priority: number;
  kenBurns: boolean;
}

const BACKGROUNDS: Record<string, string> = {
  ucl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1920&q=80',
  europa: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1920&q=80',
  premier: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1920&q=80',
  laliga: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1920&q=80',
  botola: 'https://images.unsplash.com/photo-1551958219-ac7225268270?auto=format&fit=crop&w=1920&q=80',
  international: 'https://images.unsplash.com/photo-1551958219-ac7225268270?auto=format&fit=crop&w=1920&q=80',
  general: 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1920&q=80',
};

function scoreCompetition(name: string): number {
  const lower = (name || '').toLowerCase();
  if (lower.includes('champions league')) return 0;
  if (lower.includes('europa league')) return 1;
  if (lower.includes('premier league') || lower.includes('la liga')) return 2;
  if (lower.includes('botola') || lower.includes('international') || lower.includes('derby')) return 3;
  // Fall back to ESPN league priority tiers, offset so general stays last.
  return 4 + Math.min(getLeaguePriority(name), 6);
}

function backgroundFor(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.includes('champions league')) return BACKGROUNDS.ucl;
  if (lower.includes('europa league')) return BACKGROUNDS.europa;
  if (lower.includes('premier league')) return BACKGROUNDS.premier;
  if (lower.includes('la liga')) return BACKGROUNDS.laliga;
  if (lower.includes('botola')) return BACKGROUNDS.botola;
  if (lower.includes('international') || lower.includes('derby')) return BACKGROUNDS.international;
  return BACKGROUNDS.general;
}

function taglineFor(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.includes('champions league')) return 'UEFA Champions League Night — Live on EVIV';
  if (lower.includes('europa league')) return 'UEFA Europa League Night — Live on EVIV';
  if (lower.includes('premier league')) return 'Premier League Matchday — Live on EVIV';
  if (lower.includes('la liga')) return 'La Liga Matchday — Live on EVIV';
  if (lower.includes('botola')) return 'Botola Pro Matchday — Live on EVIV';
  if (lower.includes('international')) return 'International Football — Live on EVIV';
  if (lower.includes('derby')) return 'Derby Day — Live on EVIV';
  return `${name || 'Matchday'} — Live on EVIV`;
}

/**
 * Generates a Ken Burns zoom effect style string for the hero background.
 * The background scales up slightly and translates minimally to create a
 * dynamic parallax effect while keeping text readable.
 */
function kenBurnsStyle(imageUrl: string): string {
  return `
    background-image: url('${imageUrl}');
    background-size: cover;
    background-position: center;
    animation: kenBurns 18s ease-in-out infinite alternate;
    will-change: transform;
  `;
}

export interface BannerResult {
  competition: string;
  headline?: string;
  tagline: string;
  title: string;
  subtitle: string;
  backgroundImage: string;
  background: string;
  image: string;
  imageUrl: string;
  backgroundUrl: string;
  bg: string;
  badge: string;
  priority: number;
  kenBurns: boolean;
  style?: string;
}

/**
 * Reads ESPN fixtures, detects the top competition today, and returns a
 * fully-styled hero banner with Ken Burns zoom effect.
 * 
 * Priority order: UCL > Europa > Premier/La Liga > Botola Pro/World Cup > General Matchday
 */
export async function getHeroBanner(matches?: Match[]): Promise<BannerResult> {
  const list = matches && matches.length ? matches : await getEspnMatches().catch(() => [] as Match[]);

  // Group matches by competition and pick the highest-priority one today.
  const counts = new Map<string, number>();
  for (const m of list) {
    const name = m.tournament || 'General Matchday';
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  let best = 'General Matchday';
  let bestScore = Number.POSITIVE_INFINITY;
  let bestCount = -1;

  for (const [name, count] of counts.entries()) {
    const score = scoreCompetition(name);
    if (score < bestScore || (score === bestScore && count > bestCount)) {
      best = name;
      bestScore = score;
      bestCount = count;
    }
  }

  const competition = best;
  const backgroundImage = backgroundFor(competition);
  const tagline = taglineFor(competition);

  // Select the first match' s image from that competition for Ken Burns
  const matchForCompetition = list.find((m) => (m.tournament || '').toLowerCase() === competition.toLowerCase());
  const primaryImage = matchForCompetition ? (matchForCompetition.poster || backgroundImage) : backgroundImage;

  return {
    competition,
    tagline,
    title: competition,
    headline: tagline,
    subtitle: 'Live scores, match minutes and streams — all in one place.',
    backgroundImage,
    background: backgroundImage,
    image: primaryImage,
    imageUrl: primaryImage,
    backgroundUrl: primaryImage,
    bg: primaryImage,
    badge: competition,
    priority: bestScore,
    kenBurns: true,
    // Apply Ken Burns style using the primary image for this competition
    style: kenBurnsStyle(primaryImage),
  };
}

export const getBanner = getHeroBanner;
export const getDynamicBanner = getHeroBanner;
export const bannerProvider = {
  get: getHeroBanner,
  getHeroBanner,
  getBanner,
  getDynamicBanner,
};

export default bannerProvider;