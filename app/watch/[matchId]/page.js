import { getMatchDetails, getMatchStats, resolveAllStreams } from '@/lib/streamEngine';
import StreamPlayer from '@/components/StreamPlayer';
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
import { ArrowLeft, Calendar, MapPin, RefreshCw, Trophy } from 'lucide-react';

export const revalidate = 10;

function createFallbackMatch(matchId) {
  return {
    id: matchId,
    title: 'Match Not Found',
    tournament: '',
    timestamp: new Date().getTime(),
    homeTeam: { name: 'Home', badge: '' },
    awayTeam: { name: 'Away', badge: '' },
    sources: [],
    fallbackChannels: [],
    leagueLogo: '',
    poster: '',
    venue: '',
    note: '',
  };
}

export default async function WatchPage({ params, searchParams }) {
  const { matchId } = await params;
  const resolvedSearchParams = await searchParams;
  const backTab = resolvedSearchParams?.tab || 'live';

  let match = null;
  let streamUrl = null;
  let channels = [];
  let errorMsg = null;
  let stats = null;

  const userFacingErrors = {
    'No streams available from any provider': 'No streams are available for this match right now.',
    'Match not found': 'This match could not be found. It may have been removed.',
  };

  try {
    match = await getMatchDetails(matchId);
    if (!match) throw new Error('Match not found');

    const [resolved, statsResult] = await Promise.all([
      resolveAllStreams(match.title, matchId, match.homeTeam?.name || '', match.awayTeam?.name || '', match),
      getMatchStats(matchId),
    ]);
    streamUrl = resolved.proxiedUrl || resolved.url;
    channels = resolved.channels || [];
    stats = statsResult;
  } catch (err) {
    errorMsg = userFacingErrors[err.message] || 'Unable to load this match. Please try again.';
    match = await getMatchDetails(matchId);
  }

  if (!match) {
    match = createFallbackMatch(matchId);
  }

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
      {/* Top navigation & Goal Alerts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/?tab=${backTab}`}
          className="tactile inline-flex items-center gap-2 rounded-2xl bg-navy-950/70 border border-navy-750 px-3.5 py-2 text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-700 hover:shadow-md transition-all group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Fixtures
        </Link>

        <GoalAlerts
          matchId={matchId}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeScore={match.homeScore}
          awayScore={match.awayScore}
          status={match.status}
        />
      </div>

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
          <p className="mt-0.5 text-xs text-zinc-500">The fixture has ended. Statistics and the play-by-play log below stay available.</p>
        </div>
      )}

      {match.status === 'live' && (match.currentMinute === 'HT' || match.currentMinuteNumber === 45) && (
        <div className="rounded-2xl border border-lime-500/20 bg-lime-500/5 px-4 py-3 text-center shadow-md">
          <p className="text-xs font-bold text-lime-400 uppercase tracking-widest">⚽ Halftime Interval</p>
          <p className="mt-0.5 text-xs text-zinc-500">Teams are in the locker room. The live stream will return shortly.</p>
        </div>
      )}

      {match.note && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center shadow-md">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{match.note}</p>
        </div>
      )}

      {channels.some((ch) => ch.provider === 'livefeed-fallback') && (
        <p role="status" className="rounded-2xl border border-lime-500/30 bg-navy-900 px-4 py-3 text-xs text-zinc-300">
          No match-specific M3U channel was found. The extra live channels below are best-effort backups and may show a different fixture.
        </p>
      )}

      {/* Player + sidebar: streams on the left, match info, live chat & sponsor panel on the right */}
      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex w-full min-w-0 flex-col gap-6">
          {/* Fan predictions bar above the stream player */}
          <VotingBar matchId={matchId} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />

          <MatchInsights key={matchId} matchId={matchId} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />

          {/* Player window block: every resolved server goes to the player's selector / failover chain */}
          {channels.length > 0 || (streamUrl && !errorMsg) ? (
            <StreamPlayer streamUrl={streamUrl} channels={channels} matchTitle={match.title} matchStatus={match.status} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-3xl border border-navy-750 bg-navy-950 p-6 shadow-2xl">
              <div className="text-center space-y-3 max-w-xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 border border-navy-750">
                  <RefreshCw className="h-5 w-5 text-zinc-500 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Stream is Offline</p>
                  {errorMsg ? (
                    <p className="mt-1 text-xs text-zinc-500">{errorMsg}</p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">The aggregation engine is resolving stream routes.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <a
                    href="/channels"
                    className="tactile inline-flex items-center gap-1.5 rounded-xl lime-cta px-3 py-1.5 text-[11px] font-bold"
                  >
                    Browse live channels
                  </a>
                  <a
                    href={`/watch/${matchId}`}
                    className="tactile inline-flex items-center gap-1.5 rounded-xl border border-navy-750 px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:text-white hover:border-lime-500/40 transition-all"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry servers
                  </a>
                </div>
                <p className="text-[10px] text-zinc-650">Fixtures, scores and statistics keep updating even when a stream is offline.</p>
              </div>
            </div>
          )}

          {/* Banner 728x90 below the player (desktop) */}
          <div className="flex w-full justify-center">
            <AdSlot variant="banner" banner={AD_PLACEMENTS.watchBelowPlayer} className="hidden md:flex" />
          </div>
        </div>

        {/* Sidebar: match info panel + live chat + 300x250 banner */}
        <aside className="flex w-full flex-col gap-6">
          <div className="glass-panel rounded-3xl p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              <Trophy className="h-3.5 w-3.5 text-lime-500" aria-hidden="true" />
              Match Info
            </h2>
            <dl className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Kick-off</dt>
                  <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-200">{dateStr} · {timeStr}</dd>
                </div>
              </div>
              {match.tournament ? (
                <div className="flex items-start gap-2.5">
                  <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Competition</dt>
                    <dd className="mt-0.5 font-semibold text-zinc-800 dark:text-zinc-200">{match.tournament}</dd>
                  </div>
                </div>
              ) : null}
              {match.venue ? (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Venue</dt>
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
