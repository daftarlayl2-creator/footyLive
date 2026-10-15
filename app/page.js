import { getMatches } from '@/lib/streamEngine';
import MatchGrid from '@/components/MatchGrid';
import { getHeroBanner } from '@/lib/bannerProvider';

// Live dashboard: always rendered on demand, with the upstream scoreboard
// itself cached for 15-20s inside the ESPN provider.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'EVIV Live — Today’s Football Fixtures, Live Scores & Streams',
  description:
    'Every football match of the day with real-time scores, live minutes, cards and statistics — plus premium ad-free streams.',
};

export default async function Home({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams?.tab || 'live';

  const matches = await getMatches();
  const banner = await getHeroBanner(matches).catch(() => null);

  const now = Date.now();
  const dayAgo = now - 36 * 60 * 60 * 1000;
  const visible = matches.filter((m) => {
    if (m.status === 'live') return true;
    if (m.status === 'finished') return m.timestamp >= dayAgo;
    // Upcoming: keep fixtures that have not been running for more than 30 min
    // (a stale "upcoming" row is dropped rather than shown as a fake live one).
    return m.timestamp >= now - 30 * 60 * 1000;
  });

  // Live first, then the next kick-offs, then today's results.
  const order = { live: 0, upcoming: 1, finished: 2 };
  visible.sort((a, b) => {
    const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    if (a.status === 'finished') return b.timestamp - a.timestamp;
    return a.timestamp - b.timestamp;
  });

  return (
    <div className="space-y-5">
      <MatchGrid matches={visible} defaultTab={tab} banner={banner} />
    </div>
  );
}
