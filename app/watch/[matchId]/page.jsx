import { getMatchStats, resolveAllStreams } from '@/lib/streamEngine';
import StreamAutoResolver from '@/components/StreamAutoResolver';
import WatchStreamHub from '@/components/watch/WatchStreamHub';
import MatchCountdown from '@/components/MatchCountdown';
import MatchStatsSection from '@/components/MatchStatsSection';
import LiveScoreboard from '@/components/LiveScoreboard';
import VotingBar from '@/components/predictions/VotingBar';
import MatchInsights from '@/components/predictions/MatchInsights';
import MatchChatPanel from '@/components/chat/MatchChatPanel';
import GoalAlerts from '@/components/goals/GoalAlerts';
import AdSlot from '@/components/ads/AdSlot';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadSeoMatch } from '@/lib/seo/matchData';
import { matchMetadata, sportsEventSchema } from '@/lib/seo/matches';
import { serializeJsonLd } from '@/lib/seo/site';
import { getServerSubscription } from '@/lib/subscription/server';
import { subscriptionAccess } from '@/lib/subscription/plans';
import { preparePlayback } from '@/lib/subscription/playback';
import PremiumButton from '@/components/subscription/PremiumButton';
import { ArrowLeft, Calendar, MapPin, Trophy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { matchId } = await params;
  return matchMetadata(await loadSeoMatch(matchId));
}

export default async function WatchPage({ params, searchParams, initialMatch }) {
  const { matchId } = await params;
  const resolvedSearchParams = await searchParams;
  const backTab = ['live', 'upcoming', 'finished', 'all'].includes(resolvedSearchParams?.tab) ? resolvedSearchParams.tab : 'live';
  const access = subscriptionAccess((await getServerSubscription()).grants, matchId);

  let streamUrl = null;
  let channels = [];
  let stream1 = null;
  let stream2 = null;
  let stream3 = null;
  let streamsFailed = false;
  let lockedCount = 0;
  let stats = null;

  // One retry absorbs a transient fixture-provider hiccup.
  const match = initialMatch || await loadSeoMatch(matchId);
  if (!match) notFound();

  if (match) {
    // Streams and statistics are independent: a fixture without a server yet
    // still shows its stats, line-ups and commentary.
    const [streamsResult, statsResult] = await Promise.allSettled([
      resolveAllStreams(match.title, matchId, match.homeTeam?.name || '', match.awayTeam?.name || '', match),
      getMatchStats(matchId),
    ]);
    if (streamsResult.status === 'fulfilled') {
      const playback = preparePlayback(streamsResult.value.channels || [], access);
      streamUrl = playback.defaultUrl;
      channels = playback.streams;
      // Named multi-server fallbacks (stream1/2/3): auto-switched on failure.
      stream1 = playback.stream1;
      stream2 = playback.stream2;
      stream3 = playback.stream3;
      lockedCount = playback.lockedCount;
    } else {
      // "No streams available from any provider" (or a resolver outage).
      streamsFailed = true;
    }
    stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
  }

  const schema = sportsEventSchema(match);
  const hasServers = channels.length > 0 || Boolean(streamUrl && !streamsFailed);
  const backupsOnly = channels.length > 0 && channels.every((ch) => ch.provider?.includes('fallback'));

  const dateStr = new Date(match.timestamp).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeStr = new Date(match.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const boxscore = stats?.boxscore;
  const teamStats = boxscore?.teams || [];
  const commentary = stats?.commentary || [];
  const rosters = stats?.rosters || null;

  return (
    <div className="space-y-8 w-full max-w-6xl mx-auto">
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />}
      {/* Top navigation & Goal Alerts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/?tab=${backTab}`}
          className="tactile inline-flex items-center gap-2 rounded-2xl bg-navy-950/70 border border-navy-750 px-3.5 py-2 text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-700 hover:shadow-md transition-all group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Fixtures
        </Link>

        <Link href="/multistream" className="tactile rounded-xl border border-lime-500/30 px-3 py-2 text-xs font-bold text-lime-600 dark:text-lime-300">Multi-View · up to 4 streams</Link>

        <GoalAlerts
          matchId={matchId}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeScore={match.homeScore}
          awayScore={match.awayScore}
          status={match.status}
        />
      </div>

      <h1 className="text-xl font-black text-navy-900 dark:text-white">{match.title}{match.tournament ? <span className="mt-1 block text-xs font-semibold text-navy-500 dark:text-zinc-400">{match.tournament} · Live scores & match centre</span> : null}</h1>

      {/* Scoreboard block */}
      {(match.status === 'live' || match.status === 'finished') && match.homeScore !== undefined ? (
        <LiveScoreboard matchId={matchId} initial={{
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          currentMinute: match.currentMinute,
          currentMinuteNumber: match.currentMinuteNumber,
          homeName: match.homeTeam?.name,
          awayName: match.awayTeam?.name,
          homeId: match.homeTeam?.id,
          awayId: match.awayTeam?.id,
          homeBadge: match.homeTeam?.badge,
          awayBadge: match.awayTeam?.badge,
          tournament: match.tournament,
          leagueLogo: match.leagueLogo,
          venue: match.venue,
          // Live incidents from the first render: scorers sit under their team immediately.
          period: match.live?.period || '',
          cards: match.live?.cards ?? null,
          scorers: match.live?.scorers ?? null,
          goals: match.live?.goals ?? null,
          dateStr,
          timeStr,
        }} />
      ) : (
        <MatchCountdown timestamp={match.timestamp} status={match.status} />
      )}

      {/* Special notifications banners — driven by the real upstream state */}
      {match.status === 'finished' && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center shadow-md">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">⚠️ Full Time</p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">The fixture has ended. Statistics and the play-by-play log below stay available.</p>
        </div>
      )}

      {match.status === 'live' && (match.currentMinute === 'HT' || match.currentMinuteNumber === 45) && (
        <div className="rounded-2xl border border-lime-500/20 bg-lime-500/5 px-4 py-3 text-center shadow-md">
          <p className="text-xs font-bold text-lime-400 uppercase tracking-widest">⚽ Halftime Interval</p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">Teams are in the locker room. The live stream will return shortly.</p>
        </div>
      )}

      {match.note && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center shadow-md">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{match.note}</p>
        </div>
      )}

      {backupsOnly && (
        <p role="status" className="rounded-2xl border border-lime-500/30 bg-navy-900 px-4 py-3 text-xs text-zinc-300" data-backup-notice="">
          No match-specific stream was found, so the player is using live backup channels from the IPTV feeds. They are checked for being on air, but may show a different fixture.
        </p>
      )}

      {/* Player + sidebar: streams on the left, match info, live chat & sponsor panel on the right */}
      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex w-full min-w-0 flex-col gap-6">
          {/* Fan predictions bar above the stream player */}
          <VotingBar
            matchId={matchId}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
            status={match.status}
            homeScore={match.homeScore}
            awayScore={match.awayScore}
          />

          <MatchInsights key={matchId} matchId={matchId} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />

          <PremiumButton matchId={matchId} />

          {/* Player window block: every resolved server goes to the player's selector / failover chain.
              A live fixture without a server keeps re-resolving instead of dead-ending. */}
          {hasServers || match.status === 'upcoming' ? (
            <WatchStreamHub
              matchId={matchId}
              streamUrl={streamUrl}
              channels={channels}
              stream1={stream1}
              stream2={stream2}
              stream3={stream3}
              matchTitle={match.title}
              matchStatus={match.status}
              initialLockedCount={lockedCount}
            />
          ) : (
            <StreamAutoResolver
              key={matchId}
              matchId={matchId}
              initialLockedCount={lockedCount}
              matchTitle={match.title}
              matchStatus={match.status === 'finished' ? 'finished' : 'live'}
            />
          )}

          {/* Banner 728x90 below the player (desktop) */}
          <div className="flex w-full justify-center">
            <AdSlot variant="banner" banner={AD_PLACEMENTS.watchBelowPlayer} className="hidden md:flex" />
          </div>
        </div>

        {/* Sidebar: match info panel + live chat + 300x250 banner */}
        <aside className="flex w-full flex-col gap-6">
          <div className="glass-panel rounded-3xl p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-zinc-600 dark:text-zinc-300">
              <Trophy className="h-3.5 w-3.5 text-lime-500" aria-hidden="true" />
              Match Info
            </h2>
            <dl className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Kick-off</dt>
                  <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-200">{dateStr} · {timeStr}</dd>
                </div>
              </div>
              {match.tournament ? (
                <div className="flex items-start gap-2.5">
                  <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Competition</dt>
                    <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-200">{match.tournament}</dd>
                  </div>
                </div>
              ) : null}
              {match.venue ? (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Venue</dt>
                    <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-200">{match.venue}</dd>
                  </div>
                </div>
              ) : null}
            </dl>
          </div>

          <MatchChatPanel matchId={matchId} />

          <div className="flex w-full justify-center overflow-hidden">
            <AdSlot variant="banner" banner={AD_PLACEMENTS.watchSidebar} />
          </div>
        </aside>
      </div>

      {/* Stats, tactical lineups & commentary details block */}
      <MatchStatsSection
        teamStats={teamStats}
        commentary={commentary}
        rosters={rosters}
        homeTeam={match.homeTeam}
        awayTeam={match.awayTeam}
      />
    </div>
  );
}
