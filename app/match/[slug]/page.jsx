import { notFound, permanentRedirect } from 'next/navigation';
import WatchPage from '@/app/watch/[matchId]/page';
import { loadSeoMatch } from '@/lib/seo/matchData';
import { matchHref, matchIdFromSlug, matchMetadata } from '@/lib/seo/matches';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const id = matchIdFromSlug(slug);
  return matchMetadata(id ? await loadSeoMatch(id) : null);
}
export default async function MatchPage({ params, searchParams }) {
  const { slug } = await params;
  const id = matchIdFromSlug(slug);
  if (!id) notFound();
  const match = await loadSeoMatch(id);
  if (!match) notFound();
  const canonical = matchHref(match);
  if (`/match/${slug}` !== canonical) {
    const query = await searchParams;
    const tab = typeof query?.tab === 'string' && ['live', 'upcoming', 'finished', 'all'].includes(query.tab) ? `?tab=${query.tab}` : '';
    permanentRedirect(`${canonical}${tab}`);
  }
  return <WatchPage params={Promise.resolve({ matchId: id })} searchParams={searchParams} initialMatch={match} />;
}
