'use client';

import Link from 'next/link';
import { Play, Clock, ShieldAlert, Star, Flag, Timer } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { isTeamFavorited, toggleFavoriteTeam } from '@/lib/utils/favorites';
import ClubLink from '@/components/clubs/ClubLink';
import useGoalAudio from '@/lib/hooks/useGoalAudio';

function TeamBadge({ team, size = 'h-9 w-9' }) {
  const [imgError, setImgError] = useState(false);
  const hasBadge = team.badge && !imgError;
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=18030a&color=c6ff00&size=128&bold=true&format=png`;

  if (hasBadge) {
    return (
      <img
        src={team.badge}
        alt={team.name}
        className={`${size} rounded-full object-contain bg-white dark:bg-navy-900 p-0.5 ring-1 ring-navy-200 dark:ring-navy-750 group-hover:ring-lime-500/60 group-hover:scale-110 transition-all duration-300 shadow-sm`}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <img
      src={fallbackUrl}
      alt={team.name}
      className={`${size} rounded-full object-contain ring-1 ring-navy-200 dark:ring-navy-750 group-hover:scale-110 transition-all duration-300`}
      loading="lazy"
    />
  );
}

/** Small yellow / red card chips, counted from the upstream live feed. */
function CardChips({ cards, align = 'left' }) {
  if (!cards) return null;
  const { yellow = 0, red = 0 } = cards;
  if (!yellow && !red) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: Math.min(yellow, 3) }).map((_, i) => (
        <span key={`y${i}`} className="h-3 w-2 rounded-[2px] bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]" title={`${yellow} yellow card${yellow > 1 ? 's' : ''}`} />
      ))}
      {Array.from({ length: Math.min(red, 3) }).map((_, i) => (
        <span key={`r${i}`} className="h-3 w-2 rounded-[2px] bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" title={`${red} red card${red > 1 ? 's' : ''}`} />
      ))}
      {yellow > 3 && <span className="text-[9px] font-black text-amber-400">+{yellow - 3}</span>}
    </span>
  );
}

export default function MatchCard({ match, tab }) {
  const { id, status, timestamp, homeTeam, awayTeam, sources, tournament, homeScore, awayScore, currentMinuteNumber, note, live } = match;
  const feedCount = status === 'live' && match.source === 'espn' ? match.feedStreamCount || 0 : 0;
  // `sources` is optional in practice: feed-only matches arrive without a resolved list.
  const serverCount = sources?.length || feedCount;
  const unverifiedFeed = !sources?.length && feedCount > 0 && match.feedStreamIsFallback;
  const hasHighlight = Boolean(match.highlight || match.highlightUrl || match.highlightVideo || match.hasHighlight || (Array.isArray(match.highlights) && match.highlights.length));

  const [liveData, setLiveData] = useState(null);
  const [homeFav, setHomeFav] = useState(false);
  const [awayFav, setAwayFav] = useState(false);
  const polling = useRef(null);

  useEffect(() => {
    const checkFavs = () => {
      setHomeFav(isTeamFavorited(homeTeam?.name));
      setAwayFav(isTeamFavorited(awayTeam?.name));
    };
    checkFavs();
    window.addEventListener('favorites-updated', checkFavs);
    window.addEventListener('storage', checkFavs);
    return () => {
      window.removeEventListener('favorites-updated', checkFavs);
      window.removeEventListener('storage', checkFavs);
    };
  }, [homeTeam?.name, awayTeam?.name]);

  // Live scores, minutes and cards are re-read straight from the API.
  useEffect(() => {
    if (status !== 'live') return undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/match/${id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.match) setLiveData(data.match);
      } catch {}
    };
    poll();
    polling.current = setInterval(poll, 30000);
    return () => { if (polling.current) clearInterval(polling.current); polling.current = null; };
  }, [id, status]);

  const activeLiveData = status === 'live' ? liveData : null;
  const liveMinute = activeLiveData?.currentMinute || match.currentMinute || live?.detail;
  const displayHomeScore = activeLiveData?.homeScore ?? homeScore;
  const displayAwayScore = activeLiveData?.awayScore ?? awayScore;
  const cards = {
    home: activeLiveData?.cards?.home ?? live?.cards?.home,
    away: activeLiveData?.cards?.away ?? live?.cards?.away,
  };
  const scorers = {
    home: activeLiveData?.scorers?.home?.length ? activeLiveData.scorers.home : live?.scorers?.home || [],
    away: activeLiveData?.scorers?.away?.length ? activeLiveData.scorers.away : live?.scorers?.away || [],
  };

  useGoalAudio([{ id, status: activeLiveData?.status ?? status, homeScore: displayHomeScore, awayScore: displayAwayScore }], () => homeFav || awayFav);

  const currentMinute = liveMinute || (currentMinuteNumber ? `${currentMinuteNumber}'` : '');
  const kickoff = new Date(timestamp);
  const isToday = kickoff.toDateString() === new Date().toDateString();
  const dayLabel = isToday ? '' : kickoff.toLocaleDateString([], { weekday: 'short' });
  const timeStr = status === 'live'
    ? (currentMinute || 'LIVE')
    : `${dayLabel ? `${dayLabel} ` : ''}${kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const timeLeft = status === 'upcoming' ? getTimeLeft(timestamp) : '';
  const isMatchFavorited = homeFav || awayFav;
  const showScores = status === 'live' || status === 'finished';

  const watchHref = `/watch/${id}?tab=${tab || 'live'}`;

  return (
    <article
      className={`group tactile-soft relative flex w-full min-w-0 flex-col rounded-3xl glass-panel glass-panel-hover p-4 overflow-hidden ${
        isMatchFavorited
          ? 'border-lime-300 bg-gradient-to-br from-lime-50/40 via-white/80 to-lime-50/20 ring-1 ring-lime-200/50 shadow-[0_10px_30px_rgba(198,255,0,0.1)] dark:border-lime-500/35 dark:bg-gradient-to-br dark:from-lime-950/25 dark:via-navy-850/65 dark:to-navy-950/85 dark:ring-1 dark:ring-lime-500/25 dark:shadow-[0_0_30px_rgba(198,255,0,0.2)]'
          : ''
      }`}
    >
      {/* Whole-card link (stretched overlay). Club links and favourite buttons sit above it (z-20). */}
      <Link
        href={watchHref}
        aria-label={`${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'} — open match`}
        className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      {/* Lime sheen sweep on hover */}
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(198,255,0,0.12),transparent_60%)]" />

      {/* Top Header */}
      <div className="relative flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {status === 'live' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-500/10 border border-lime-500/30 px-2.5 py-0.5 text-[11px] font-extrabold text-lime-600 dark:text-lime-400">
              <span className="live-dot relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-500" />
              {currentMinute || 'LIVE'}
            </span>
          ) : status === 'finished' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 dark:bg-navy-900 border border-navy-200 dark:border-navy-750 px-2.5 py-0.5 text-[11px] font-bold text-navy-600 dark:text-zinc-300 shadow-sm">
              <Flag className="h-3 w-3" />
              FT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100/70 border border-navy-200/70 dark:bg-navy-900 dark:border-navy-750 px-2.5 py-0.5 text-[11px] font-bold text-navy-700 dark:text-zinc-300 shadow-sm">
              <Clock className="h-3 w-3" />
              {timeStr}
            </span>
          )}

          {isMatchFavorited && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 tracking-wider uppercase animate-pulse">
              <Star className="h-2.5 w-2.5 fill-amber-400" />
              Starred
            </span>
          )}
        </div>
        {tournament && (
          <span className="text-[11px] font-bold text-navy-600 dark:text-zinc-400 truncate max-w-[130px] flex items-center gap-1.5 bg-navy-100/60 border border-navy-200/60 dark:bg-navy-900/70 dark:border-navy-750 px-2.5 py-0.5 rounded-full shadow-sm transition-colors group-hover:border-lime-500/30" title={tournament}>
            <span className="h-1.5 w-1.5 rounded-full bg-lime-500 inline-block shrink-0" />
            <span className="truncate">{tournament}</span>
          </span>
        )}
      </div>

      {/* Main scoreboard block */}
      <div className="relative space-y-3.5 py-1">
        {/* Home Team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <ClubLink
              team={homeTeam}
              className="relative z-20 flex min-w-0 items-center gap-2.5 rounded-xl pr-1 hover:[&>span]:text-lime-600 dark:hover:[&>span]:text-lime-400"
            >
              <TeamBadge team={homeTeam} />
              <span className="text-[14px] font-bold truncate text-navy-800 dark:text-zinc-100 group-hover:text-lime-600 dark:group-hover:text-white transition-colors">{homeTeam?.name}</span>
            </ClubLink>
            <CardChips cards={cards.home} />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavoriteTeam(homeTeam);
              }}
              data-sound="toggle"
              className="relative z-20 p-1.5 rounded-lg hover:bg-navy-100/70 dark:hover:bg-navy-900/90 text-navy-400 hover:text-amber-500 dark:text-zinc-500 dark:hover:text-amber-400 active:scale-75 transition-all ease-spring shrink-0 ml-1 opacity-65 group-hover:opacity-100 cursor-pointer"
              aria-label={`${homeFav ? "Unfavorite" : "Favorite"} ${homeTeam?.name}`}
              aria-pressed={homeFav}
              title={homeFav ? "Unfavorite Team" : "Favorite Team"}
            >
              <Star className={`h-3.5 w-3.5 transition-all ${homeFav ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]' : 'text-navy-400 dark:text-zinc-500'}`} />
            </button>
          </div>
          {showScores && displayHomeScore !== undefined && (
            <span className={`text-[18px] font-black tabular-nums shrink-0 px-2.5 py-0.5 rounded-xl border shadow-sm transition-colors ${
              status === 'live'
                ? 'text-lime-700 dark:text-lime-300 bg-lime-500/10 border-lime-500/25'
                : 'text-navy-800 dark:text-white bg-navy-100/85 dark:bg-navy-900 border-navy-200 dark:border-navy-750'
            }`}>{displayHomeScore}</span>
          )}
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <ClubLink
              team={awayTeam}
              className="relative z-20 flex min-w-0 items-center gap-2.5 rounded-xl pr-1 hover:[&>span]:text-lime-600 dark:hover:[&>span]:text-lime-400"
            >
              <TeamBadge team={awayTeam} />
              <span className="text-[14px] font-bold truncate text-navy-800 dark:text-zinc-100 group-hover:text-lime-600 dark:group-hover:text-white transition-colors">{awayTeam?.name}</span>
            </ClubLink>
            <CardChips cards={cards.away} />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavoriteTeam(awayTeam);
              }}
              data-sound="toggle"
              className="relative z-20 p-1.5 rounded-lg hover:bg-navy-100/70 dark:hover:bg-navy-900/90 text-navy-400 hover:text-amber-500 dark:text-zinc-500 dark:hover:text-amber-400 active:scale-75 transition-all ease-spring shrink-0 ml-1 opacity-65 group-hover:opacity-100 cursor-pointer"
              aria-label={`${awayFav ? "Unfavorite" : "Favorite"} ${awayTeam?.name}`}
              aria-pressed={awayFav}
              title={awayFav ? "Unfavorite Team" : "Favorite Team"}
            >
              <Star className={`h-3.5 w-3.5 transition-all ${awayFav ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]' : 'text-navy-400 dark:text-zinc-500'}`} />
            </button>
          </div>
          {showScores && displayAwayScore !== undefined && (
            <span className={`text-[18px] font-black tabular-nums shrink-0 px-2.5 py-0.5 rounded-xl border shadow-sm transition-colors ${
              status === 'live'
                ? 'text-lime-700 dark:text-lime-300 bg-lime-500/10 border-lime-500/25'
                : 'text-navy-800 dark:text-white bg-navy-100/85 dark:bg-navy-900 border-navy-200 dark:border-navy-750'
            }`}>{displayAwayScore}</span>
          )}
        </div>

        {/* Real-time scorer feed (live matches only) */}
        {status === 'live' && (scorers.home.length > 0 || scorers.away.length > 0) && (
          <div className="space-y-1 pt-1">
            {[['home', scorers.home], ['away', scorers.away]].map(([side, list]) =>
              list.length ? (
                <p key={side} className={`text-[10.5px] font-semibold text-navy-500 dark:text-zinc-400 truncate ${side === 'away' ? 'text-right' : ''}`}>
                  {list.slice(-3).join(' · ')}
                </p>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-navy-200 dark:via-navy-750 to-transparent my-3.5 group-hover:via-lime-500/40 transition-colors duration-500" />

      {/* Footer Info */}
      <div className="relative flex items-center justify-between text-xs">
        <span className="text-[11px] text-navy-500 dark:text-zinc-500 font-bold tracking-wide flex items-center gap-1.5">
          {note ? (
            <span className="text-amber-600 dark:text-amber-400">{note}</span>
          ) : unverifiedFeed ? (
            `${serverCount} live channel${serverCount !== 1 ? 's' : ''} · fixture unverified`
          ) : serverCount === 0 ? (
            'Verification only'
          ) : (
            `${serverCount} stream server${serverCount !== 1 ? 's' : ''}`
          )}
        </span>

        {hasHighlight && (status === 'live' || status === 'finished') && (
          <span className="inline-flex items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[10px] font-extrabold text-lime-600 dark:text-lime-400">
            Watch Goals 🎥
          </span>
        )}

        {serverCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-600 dark:text-lime-400 group-hover:text-lime-500 dark:group-hover:text-lime-300 transition-colors">
            <Play className="h-3 w-3 fill-lime-500/25 group-hover:scale-110 transition-transform" />
            {unverifiedFeed ? 'Try Live Channels' : 'Watch Stream'}
          </span>
        ) : status === 'live' ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            Explore Streams
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-navy-500 dark:text-zinc-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            Pending Link
          </span>
        )}
      </div>

      {status === 'upcoming' && timeLeft && (
        <div className="relative mt-3 rounded-2xl bg-navy-100/80 border border-navy-200 dark:bg-navy-950/70 dark:border-navy-750 px-3 py-2 text-center text-xs font-bold text-navy-700 dark:text-zinc-300 shadow-inner">
          {timeLeft.toLowerCase().trim().includes('starting soon') ? (
            <span className="text-lime-600 dark:text-lime-400 font-black animate-pulse">Starting soon</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-lime-500" />
              Kickoff in <span className="text-lime-600 dark:text-lime-400 font-black font-mono">{timeLeft}</span>
            </span>
          )}
        </div>
      )}

      {status === 'finished' && (
        <div className="relative mt-3 rounded-2xl bg-navy-100/70 border border-navy-200 dark:bg-navy-950/60 dark:border-navy-750 px-3 py-2 text-center text-[11px] font-bold text-navy-600 dark:text-zinc-400">
          Full time · stats &amp; highlights available
        </div>
      )}
    </article>
  );
}

function getTimeLeft(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'Starting soon';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
