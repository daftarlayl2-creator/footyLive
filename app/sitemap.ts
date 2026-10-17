import type { MetadataRoute } from 'next';
import { isLiveTvEnabled } from '@/lib/config/features';
import { getMatches } from '@/lib/streamEngine';
import { clubHref } from '@/lib/clubs/links';
import { matchHref } from '@/lib/seo/matches';
import { absoluteUrl } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

/** Public routes worth crawling. Private/noindex routes (`/staff`, `/profile`, …) stay out. */
const STATIC_ROUTES: Array<[string, NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>, number]> = [
  ['/', 'hourly', 1],
  ['/standings', 'daily', 0.8],
  ['/highlights', 'daily', 0.7],
  ['/channels', 'daily', 0.6],
  ['/pricing', 'weekly', 0.6],
  ['/advertise', 'monthly', 0.4],
  ['/about', 'monthly', 0.3],
  ['/contact', 'monthly', 0.3],
  ['/privacy', 'yearly', 0.2],
  ['/terms', 'yearly', 0.2],
  ['/copyright', 'yearly', 0.2],
  ['/api-partnerships', 'monthly', 0.3],
  ['/submit', 'monthly', 0.3],
  ['/spin', 'daily', 0.5],
  ['/leaderboard', 'daily', 0.5],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await getMatches().catch(() => []);
  const paths = new Map<string, MetadataRoute.Sitemap[number]>();
  // TV routes stay out of the sitemap while Live TV is hidden.
  const staticRoutes = isLiveTvEnabled() ? STATIC_ROUTES : STATIC_ROUTES.filter(([path]) => path !== '/channels');
  for (const [path, changeFrequency, priority] of staticRoutes) {
    paths.set(path, { url: absoluteUrl(path), changeFrequency, priority });
  }
  for (const match of matches.slice(0, 2000)) {
    const path = matchHref(match);
    paths.set(path, { url: absoluteUrl(path), changeFrequency: match.status === 'live' ? 'always' : 'daily', priority: match.status === 'live' ? 0.9 : 0.6 });
  }
  // Club profiles linked from real fixtures (never invented ids): `/club/{id}-{slug}`.
  let clubs = 0;
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (clubs >= 500) break;
      const href = clubHref({ id: team?.id, name: team?.name });
      if (!href || paths.has(href)) continue;
      paths.set(href, { url: absoluteUrl(href), changeFrequency: 'weekly', priority: 0.5 });
      clubs += 1;
    }
    if (clubs >= 500) break;
  }
  // Player profiles have stable canonical /player/[id] links in lineups, squads and leaderboards.
  // Do not enumerate unverified/invented player ids just to inflate a sitemap.
  return [...paths.values()];
}
