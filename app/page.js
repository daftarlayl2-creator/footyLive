import { catalogMatch } from '@/lib/subscription/catalog';
import { getMatches } from '@/lib/streamEngine';
import { selectVisibleMatches } from '@/lib/match/visible';
import MatchGrid from '@/components/MatchGrid';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getHeroBanner } from '@/lib/bannerProvider';
import AdSlot from '@/components/ads/AdSlot';
import TopSportsBanner from '@/components/ads/TopSportsBanner';
import { AD_PLACEMENTS } from '@/lib/adsConfig';

// Live dashboard: always rendered on demand, with the upstream scoreboard
// itself cached for 15-20s inside the ESPN provider.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Limon Live — Today’s Football Fixtures, Live Scores & Streams',
  description:
    'Every football match of the day with real-time scores, live minutes, cards and statistics — plus reliable live streams.',
  alternates: { canonical: '/' },
};

export default async function Home({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams?.tab || 'live';

  const matches = await getMatches();
  const banner = await getHeroBanner(matches).catch(() => null);
  const visible = selectVisibleMatches(matches);

  return (
    <div className="w-full space-y-5">
      {/* Top sticky rotating sports banner: partner creatives + the network
          leaderboard cycle smoothly above the feed (hidden for VIP fans). */}
      <TopSportsBanner />
      {/* Homepage top banner: leaderboard on desktop, 320x50 on mobile.
          The mobile slot breaks out of main's px-4 so the 320px unit fits a
          320px viewport exactly without ever pushing the page sideways. */}
      <div className="hidden w-full justify-center md:flex">
        <AdSlot variant="banner" banner={AD_PLACEMENTS.homeTopDesktop} />
      </div>
      <div className="-mx-4 flex w-[calc(100%+2rem)] justify-center overflow-hidden md:hidden">
        <AdSlot variant="banner" banner={AD_PLACEMENTS.homeTopMobile} />
      </div>
      <ErrorBoundary name="match-grid" title="Fixtures panel hit a snag" message="The live fixture grid could not be rendered, but the rest of your matchday is still running. Try loading the grid again.">
        <MatchGrid matches={visible.map(catalogMatch)} defaultTab={tab} banner={banner} />
      </ErrorBoundary>
    </div>
  );
}
