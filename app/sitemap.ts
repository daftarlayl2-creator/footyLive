import type { MetadataRoute } from 'next';
import { getMatches } from '@/lib/streamEngine';
import { matchHref } from '@/lib/seo/matches';
import { absoluteUrl } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await getMatches().catch(() => []);
  const paths = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const path of ['/', '/standings', '/highlights', '/pricing']) paths.set(path, { url: absoluteUrl(path), changeFrequency: path === '/' ? 'hourly' : 'daily', priority: path === '/' ? 1 : 0.7 });
  for (const match of matches.slice(0, 2000)) {
    const path = matchHref(match);
    paths.set(path, { url: absoluteUrl(path), changeFrequency: match.status === 'live' ? 'always' : 'daily', priority: match.status === 'live' ? 0.9 : 0.6 });
  }
  // Player profiles have stable canonical /player/[id] links in lineups, squads and leaderboards.
  // Do not enumerate unverified/invented player ids just to inflate a sitemap.
  return [...paths.values()];
}
