import WatchPage from '@/app/watch/[matchId]/page';

export const revalidate = 10;

/** Match detail alias; both URLs render the same live watch experience. */
export default async function MatchPage({ params, searchParams }) {
  const { id } = await params;
  return <WatchPage params={Promise.resolve({ matchId: id })} searchParams={searchParams} />;
}
