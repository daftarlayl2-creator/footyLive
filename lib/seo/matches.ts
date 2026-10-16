import { absoluteUrl, safeRemoteUrl } from './site';

export interface SeoFixture {
  id: string;
  title?: string;
  homeTeam?: { name?: string; badge?: string };
  awayTeam?: { name?: string; badge?: string };
  tournament?: string;
  timestamp?: number;
  status?: string;
  venue?: string;
  poster?: string;
}
export function slugify(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/, '');
}
const kickoffIso = (timestamp?: number) => {
  const date = new Date(timestamp ?? NaN);
  return Number.isFinite(timestamp) && timestamp! > 0 && Number.isFinite(date.getTime()) ? date.toISOString() : '';
};
const validId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(id) && !id.includes('--');
export function matchHref(match: SeoFixture): string {
  const teams = [match.homeTeam?.name, match.awayTeam?.name].filter(Boolean).join(' vs ');
  const date = kickoffIso(match.timestamp).slice(0, 10);
  const slug = slugify([teams || match.title || 'football-match', match.tournament, date].filter(Boolean).join(' ')) || 'football-match';
  return `/match/${slug}--${encodeURIComponent(match.id)}`;
}
export function matchIdFromSlug(slug: string): string | null {
  if (typeof slug !== 'string' || slug.length > 300) return null;
  const index = slug.lastIndexOf('--');
  const id = index >= 0 ? slug.slice(index + 2) : slug;
  return validId(id) ? id : null;
}
const label = (match: SeoFixture) => [match.homeTeam?.name, match.awayTeam?.name].filter(Boolean).join(' vs ') || match.title || 'Football match';

/** Shared match-page title pattern: `[Home] vs [Away] — Live Score, Stats & Streams | Limon Live`. */
export function matchTitle(match: SeoFixture): string {
  return `${label(match)} — Live Score, Stats & Streams | Limon Live`;
}

export function matchMetadata(match: SeoFixture | null) {
  if (!match) return { title: 'Match not found | Limon Live', robots: { index: false, follow: false } };
  const name = label(match);
  const date = kickoffIso(match.timestamp).slice(0, 10);
  const title = matchTitle(match);
  // Context-aware description: competition + date + status wording.
  const when = [match.tournament, date].filter(Boolean).join(', ');
  const story = match.status === 'finished'
    ? 'Full-time result, match statistics, line-ups and highlights.'
    : match.status === 'live'
      ? 'Follow the live score, minute-by-minute updates, match statistics, line-ups and commentary.'
      : 'Kick-off time, preview, line-ups and live score once the match starts.';
  const description = `${name}${when ? ` — ${when}` : ''}. ${story} Live on Limon Live.`;
  const url = absoluteUrl(matchHref(match));
  const image = safeRemoteUrl(match.poster);
  return {
    title, description, alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, siteName: 'Limon Live', ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

/** Publish only sourced event facts. Do not invent end times, attendance, tickets or venues. */
export function sportsEventSchema(match: SeoFixture): Record<string, unknown> | null {
  if (!match.id || !match.homeTeam?.name || !match.awayTeam?.name || !kickoffIso(match.timestamp)) return null;
  const url = absoluteUrl(matchHref(match));
  const image = safeRemoteUrl(match.poster);
  const team = (entry: NonNullable<SeoFixture['homeTeam']>) => ({ '@type': 'SportsTeam', name: entry.name, ...(safeRemoteUrl(entry.badge) ? { logo: safeRemoteUrl(entry.badge) } : {}) });
  // Live/finished are not EventStatusType values. Keep EventScheduled for a fixture that took place.
  const status = /cancel/i.test(match.status || '') ? 'EventCancelled' : /postpon/i.test(match.status || '') ? 'EventPostponed' : 'EventScheduled';
  return {
    '@context': 'https://schema.org', '@type': 'SportsEvent', '@id': `${url}#event`, url,
    name: label(match), description: matchMetadata(match).description, sport: 'Football',
    startDate: kickoffIso(match.timestamp), eventStatus: `https://schema.org/${status}`,
    homeTeam: team(match.homeTeam), awayTeam: team(match.awayTeam),
    ...(match.tournament ? { superEvent: { '@type': 'SportsEvent', name: match.tournament } } : {}),
    ...(match.venue?.trim() ? { location: { '@type': 'Place', name: match.venue.trim() } } : {}),
    ...(image ? { image: [image] } : {}),
  };
}
