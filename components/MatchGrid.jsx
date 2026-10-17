'use client';

import { Fragment, useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, Calendar, Star, ChevronLeft, ChevronRight, Flag, CheckCircle, Video } from 'lucide-react';
import MatchCard from './MatchCard';
import HighlightCard from '@/components/HighlightCard';
import HighlightPlayerModal from '@/components/HighlightPlayerModal';
import AdSlot from '@/components/ads/AdSlot';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import { fetchHighlightsSafely } from '@/lib/utils/highlightsClient';
import { getFavoriteTeams } from '@/lib/utils/favorites';
import FavoritesHub from '@/components/favorites/FavoritesHub';
import useGoalAudio from '@/lib/hooks/useGoalAudio';

function Ball({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.2">
      <circle cx="12" cy="12" r="9" className="stroke-lime-500/10" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" className="stroke-lime-500/10" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" className="stroke-lime-500/10" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" className="stroke-lime-500/10" />
      <circle cx="12" cy="12" r="2.5" className="fill-lime-500/10" opacity="0.4" />
    </svg>
  );
}

function Trophy({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v4a6 6 0 0 1-12 0V3z" className="stroke-lime-500/10" />
      <path d="M8 3a4 4 0 0 0-4 4 3 3 0 0 0 3 3h1" className="stroke-lime-500/10" />
      <path d="M16 3a4 4 0 0 1 4 4 3 3 0 0 1-3 3h-1" className="stroke-lime-500/10" />
      <path d="M12 14v4" className="stroke-lime-500/10" />
      <path d="M8 21h8" className="stroke-lime-500/10" />
    </svg>
  );
}

export default function MatchGrid({ matches, defaultTab, banner }) {
  const [tab, setTab] = useState(defaultTab);
  const [highlights, setHighlights] = useState([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState(null);
  useEffect(() => {
    if (tab !== 'highlights') return undefined;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setHighlightsLoading(true);
    });
    // Always resolves within 3s (empty list on timeout / error) — the tab
    // never stays stuck on "Loading highlights…".
    fetchHighlightsSafely().then((list) => {
      if (cancelled) return;
      setHighlights(list);
      setHighlightsLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab]);
  const [search, setSearch] = useState('');
  const [selectedLeagues, setSelectedLeagues] = useState([]);
  const [favorites, setFavorites] = useState([]);

  const scrollRef = useRef(null);

  const scrollLeagues = (direction) => {
    if (!scrollRef.current) return;
    const scrollAmount = 250;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Phase 1 §D: targeted polling of the canonical matches API instead of a
  // whole-page router.refresh() every 20s. Server-rendered props seed the
  // first paint; /api/matches keeps cards current without losing scroll,
  // filters, or modal state. Failures keep the last verified list.
  const [liveMatches, setLiveMatches] = useState(matches);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) setLiveMatches(matches); });
    return () => { cancelled = true; };
  }, [matches]);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/matches', { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const payload = await response.json().catch(() => null);
        if (!cancelled && Array.isArray(payload?.matches)) setLiveMatches(payload.matches);
      } catch { /* keep last verified list */ }
    };
    const interval = setInterval(() => { void poll(); }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const updateFavs = () => {
      setFavorites(getFavoriteTeams());
    };
    updateFavs();
    window.addEventListener('favorites-updated', updateFavs);
    window.addEventListener('storage', updateFavs);
    return () => {
      window.removeEventListener('favorites-updated', updateFavs);
      window.removeEventListener('storage', updateFavs);
    };
  }, []);

  useGoalAudio(liveMatches, (match) => favorites.some((name) =>
    name.toLowerCase() === match.homeTeam?.name?.toLowerCase() || name.toLowerCase() === match.awayTeam?.name?.toLowerCase()
  ));

  // Statuses and minutes are rendered exactly as the upstream providers
  // reported them. Live status is never inferred here from kick-off times
  // or elapsed wall-clock time.
  const enrichedMatches = liveMatches;

  const live = useMemo(() => enrichedMatches.filter(m => m.status === 'live'), [enrichedMatches]);
  const upcoming = useMemo(
    () => enrichedMatches.filter(m => m.status === 'upcoming').sort((a, b) => a.timestamp - b.timestamp),
    [enrichedMatches]
  );
  const finished = useMemo(
    () => enrichedMatches.filter(m => m.status === 'finished').sort((a, b) => b.timestamp - a.timestamp),
    [enrichedMatches]
  );

  const baseMatches = tab === 'upcoming' ? upcoming : tab === 'finished' ? finished : live;

  const leaguesWithLogos = useMemo(() => {
    const leagueMap = new Map();
    for (const m of baseMatches) {
      if (m.tournament && !leagueMap.has(m.tournament)) {
        leagueMap.set(m.tournament, { name: m.tournament, logo: m.leagueLogo || '' });
      }
    }
    return Array.from(leagueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [baseMatches]);

  // Synchronize selection: ignore any selected league that is not active in the current tab
  const activeSelectedLeagues = useMemo(
    () => selectedLeagues.filter((name) => leaguesWithLogos.some((l) => l.name === name)),
    [selectedLeagues, leaguesWithLogos]
  );

  const filtered = useMemo(() => {
    let result = baseMatches;
    if (activeSelectedLeagues.length > 0) {
      result = result.filter(m => activeSelectedLeagues.includes(m.tournament));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(m =>
        m.homeTeam.name.toLowerCase().includes(q) ||
        m.awayTeam.name.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.tournament.toLowerCase().includes(q)
      );
    }
    return result;
  }, [baseMatches, activeSelectedLeagues, search]);

  // Decouple filtered matches into favorited and standard categories
  const { starredMatches, normalMatches } = useMemo(() => {
    const starred = [];
    const normal = [];
    for (const m of filtered) {
      const isHomeFav = favorites.some(f => f.toLowerCase() === m.homeTeam?.name?.toLowerCase());
      const isAwayFav = favorites.some(f => f.toLowerCase() === m.awayTeam?.name?.toLowerCase());
      if (isHomeFav || isAwayFav) {
        starred.push(m);
      } else {
        normal.push(m);
      }
    }
    return { starredMatches: starred, normalMatches: normal };
  }, [filtered, favorites]);

  return (
    <div className="space-y-8 relative w-full max-w-full overflow-x-clip">
      <FavoritesHub favorites={favorites} matches={liveMatches} />
      {/* Decorative desktop illustrations */}
      <Ball className="fixed left-6 top-28 h-20 w-20 opacity-40 rotate-12 hidden xl:block animate-pulse-slow" />
      <Trophy className="fixed right-6 top-32 h-20 w-20 opacity-40 rotate-45 hidden xl:block animate-pulse-slow" />

      {/* Dynamic event-driven hero banner */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200/80 dark:border-navy-750/80 shadow-app dark:shadow-app-dark transition-all duration-350" style={{ minHeight: 180 }}>
        <div
          className="absolute inset-0 bg-cover bg-center ken-burns"
          style={{ backgroundImage: `url(${banner?.backgroundImage || 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1920&q=80'})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/60 to-transparent" />
        <div className="relative z-10 max-w-lg space-y-2 px-6 py-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-lime-500/10 border border-lime-500/25 px-3 py-1 text-xs font-semibold text-lime-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
            {banner?.competition || 'Real-time football data'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {banner?.tagline || 'Never Miss a Single Kick'}
          </h1>
          <p className="text-sm text-zinc-300">
            Every fixture of the day — live scores, match minutes, cards and statistics pulled straight from the
            live scoreboard, next to reliable live streams.
          </p>
        </div>
      </div>

      {/* Source status — shown only while the live data feed returns nothing */}
      {enrichedMatches.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-4 py-3 text-[11.5px] font-semibold text-navy-700 dark:text-zinc-300">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          </span>
          <p>
            Waiting on the live data source — today&apos;s real fixtures and live statistics are reloaded automatically
            every 20 seconds.
          </p>
        </div>
      )}

      {/* Control panel & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-4 sm:p-5 rounded-3xl border border-zinc-200/80 dark:border-navy-750/60">
        
        {/* Sliding Tabs — scroll horizontally inside their own container on small screens */}
        <div role="tablist" aria-label="Match status" className="tabs-scroll scrollbar-none flex w-full flex-nowrap gap-1 rounded-2xl bg-zinc-200/60 dark:bg-navy-950 p-1 border border-zinc-300/45 dark:border-navy-750/80 md:w-auto md:max-w-none">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'live'}
            onClick={() => setTab('live')}
            className={`tactile flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider cursor-pointer ${
              tab === 'live'
                ? 'bg-lime-500 text-navy-950 shadow-glow-lime'
                : 'text-zinc-700 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-navy-900 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <span className={`inline-flex h-2 w-2 rounded-full bg-red-500 ${tab === 'live' ? 'live-dot' : ''}`} />
            Live Now ({live.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            onClick={() => setTab('upcoming')}
            className={`tactile flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider cursor-pointer ${
              tab === 'upcoming'
                ? 'bg-lime-500 text-navy-950 shadow-glow-lime'
                : 'text-zinc-700 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-navy-900 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'finished'}
            onClick={() => setTab('finished')}
            className={`tactile flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider cursor-pointer ${
              tab === 'finished'
                ? 'bg-lime-500 text-navy-950 shadow-glow-lime'
                : 'text-zinc-700 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-navy-900 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Finished ({finished.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'highlights'}
            onClick={() => setTab('highlights')}
            className={`tactile flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider cursor-pointer ${
              tab === 'highlights'
                ? 'bg-lime-500 text-navy-950 shadow-glow-lime'
                : 'text-zinc-700 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-navy-900 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            Highlights & Goals
          </button>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full sm:w-auto flex-1 sm:flex-initial">
          
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Search teams or leagues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56 rounded-2xl border border-zinc-200 bg-white dark:border-navy-750 dark:bg-navy-950 py-2.5 pl-9 pr-4 text-sm sm:text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all"
            />
          </div>

        </div>
      </div>

      {/* Modern Leagues Horizontal Scrollbar Shelf */}
      {(() => {
        if (leaguesWithLogos.length === 0) return null;

        const isAllSelected = activeSelectedLeagues.length === 0;

        return (
          <div className="space-y-3.5 p-4 sm:p-5 bg-white/80 dark:bg-navy-850/50 border border-zinc-200/80 dark:border-navy-750/60 rounded-2xl shadow-sm transition-all duration-300">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-lime-500" />
                Filter by Tournament
              </label>
              {!isAllSelected && (
                <button 
                  onClick={() => setSelectedLeagues([])}
                  className="text-[10px] font-extrabold uppercase tracking-wider text-lime-600 dark:text-lime-400 hover:text-lime-800 dark:hover:text-lime-300 transition-colors cursor-pointer"
                >
                  Reset view
                </button>
              )}
            </div>
            
            {/* Scroll Container Wrapper with Edge Fades */}
            <div className="relative w-full overflow-hidden group/shelf">
              {/* Subtle edge fades for scrolling indication */}
              <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white/80 dark:from-[#0d1730]/80 to-transparent pointer-events-none z-10" />
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 dark:from-[#0d1730]/80 to-transparent pointer-events-none z-10" />
              
              {/* Left scroll chevron */}
              <button 
                onClick={() => scrollLeagues('left')}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 dark:bg-navy-900/95 border border-zinc-200/60 dark:border-navy-750/80 text-zinc-600 dark:text-zinc-300 hover:text-lime-600 dark:hover:text-lime-400 shadow-md hover:scale-105 active:scale-95 transition-all opacity-0 group-hover/shelf:opacity-100 cursor-pointer"
                title="Scroll Left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* Right scroll chevron */}
              <button 
                onClick={() => scrollLeagues('right')}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 dark:bg-navy-900/95 border border-zinc-200/60 dark:border-navy-750/80 text-zinc-600 dark:text-zinc-300 hover:text-lime-600 dark:hover:text-lime-400 shadow-md hover:scale-105 active:scale-95 transition-all opacity-0 group-hover/shelf:opacity-100 cursor-pointer"
                title="Scroll Right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <div 
                ref={scrollRef}
                className="tabs-scroll flex flex-row flex-nowrap gap-1.5 py-1.5 px-1 -mx-1 custom-horizontal-scrollbar scroll-smooth"
              >
                {/* "All Leagues" Pill */}
                <button
                  onClick={() => setSelectedLeagues([])}
                  className={`tactile flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide cursor-pointer border shrink-0 ${
                    isAllSelected
                      ? 'bg-lime-500 text-navy-950 border-lime-400 shadow-md shadow-lime-600/25 scale-[1.02]'
                      : 'bg-white dark:bg-navy-950 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-navy-750/80 hover:bg-zinc-100 dark:hover:bg-navy-900/60 hover:scale-[1.01]'
                  }`}
                >
                  <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                    isAllSelected ? 'bg-white/20' : 'bg-zinc-100 dark:bg-navy-900 text-zinc-500 dark:text-zinc-400'
                  }`}>
                    <Star className="h-2 w-2" />
                  </div>
                  <span>All Tournaments</span>
                </button>

                {/* Tournament pills */}
                {leaguesWithLogos.map((l) => {
                  const isActive = activeSelectedLeagues.includes(l.name);
                  const count = baseMatches.filter(m => m.tournament === l.name).length;

                  return (
                    <button
                      key={l.name}
                      onClick={() => {
                        setSelectedLeagues(prev =>
                          prev.includes(l.name)
                            ? prev.filter(name => name !== l.name)
                            : [...prev, l.name]
                        );
                      }}
                      className={`tactile flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide cursor-pointer border shrink-0 ${
                        isActive
                          ? 'bg-lime-500 text-navy-950 border-lime-400 shadow-md shadow-lime-600/25 scale-[1.02]'
                          : 'bg-white dark:bg-navy-950 text-zinc-700 dark:text-zinc-400 border-zinc-200 dark:border-navy-750/80 hover:bg-zinc-100 dark:hover:bg-navy-900/60 hover:scale-[1.01]'
                      }`}
                    >
                      {l.logo ? (
                        <img 
                          src={l.logo} 
                          alt="" 
                          className="h-3.5 w-3.5 rounded-full object-contain bg-zinc-50 dark:bg-navy-900 p-0.5" 
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black ${
                          isActive ? 'bg-white/20' : 'bg-lime-500/10 text-lime-500'
                        }`}>
                          {l.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span>{l.name}</span>
                      <span className={`text-[8px] px-1 py-0.2 rounded-md font-bold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-navy-900 text-zinc-600 dark:text-zinc-300'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fixtures Listings */}
      {tab === 'highlights' ? (
        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((h, i) => (
            <Fragment key={h.id}>
              <HighlightCard highlight={h} onPlay={setActiveHighlight} />
              {/* Native banner inside the highlights grid */}
              {(i + 1) % 6 === 0 && (
                <div className="col-span-full flex w-full justify-center">
                  <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
                </div>
              )}
            </Fragment>
          ))}
          {highlightsLoading && (
            <div className="col-span-full flex items-center gap-2.5 text-zinc-600 dark:text-zinc-400 text-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-500/20 border-t-lime-500" />
              Loading highlights…
            </div>
          )}
          {!highlightsLoading && highlights.length === 0 && (
            <p className="col-span-full text-zinc-600 dark:text-zinc-400 text-sm">No recent highlights</p>
          )}
          {(highlights.length === 0 || highlights.length % 6 !== 0) && (
            <div className="col-span-full flex w-full justify-center">
              <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 glass-panel rounded-3xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 border border-zinc-200 dark:bg-navy-950 dark:border-navy-750 shadow-inner">
            <svg className="h-6 w-6 text-zinc-400 dark:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <p className="text-sm font-bold text-zinc-700 dark:text-zinc-400">
            {search || selectedLeagues.length > 0
              ? 'No matching fixtures found'
              : tab === 'live'
                ? 'No live games running'
                : tab === 'finished'
                  ? 'No completed matches yet'
                  : 'No upcoming fixtures scheduled'}
          </p>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 max-w-xs text-center leading-relaxed">
            {search || selectedLeagues.length > 0
              ? 'Try adjusting search terms or clearing selected league filters.'
              : tab === 'live'
                ? 'Browse the upcoming tab to see what is scheduled next.'
                : tab === 'finished'
                  ? 'Results appear here as soon as a match ends.'
                  : 'Check back later for updated fixtures.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Prioritized Starred Matches list */}
          {starredMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-500 dark:text-amber-400 animate-pulse">
                  <Star className="h-3.5 w-3.5 fill-amber-400" />
                </div>
                <h2 className="text-xs font-extrabold uppercase tracking-widest text-amber-600 dark:text-amber-400">Starred Team Fixtures</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 via-zinc-300 dark:via-zinc-800 to-transparent ml-2" />
              </div>
              <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8">
                {starredMatches.map(match => (
                  <MatchCard key={match.id} match={match} tab={tab} />
                ))}
              </div>
            </div>
          )}

          {/* Standard listings */}
          {normalMatches.length > 0 && (
            <div className="space-y-4">
              {starredMatches.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-200/85 border border-zinc-300/70 text-zinc-600 dark:bg-navy-900 dark:border-navy-750 dark:text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="text-xs font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Other Fixtures</h2>
                  <div className="h-px flex-1 bg-gradient-to-r from-zinc-300/80 dark:from-zinc-800/80 via-zinc-200/30 dark:via-zinc-900/30 to-transparent ml-2" />
                </div>
              )}
              <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:gap-8">
                {normalMatches.map(match => (
                  <MatchCard key={match.id} match={match} tab={tab} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Native banner inside the match cards feed (every non-highlights tab) */}
      {tab !== 'highlights' && (
        <div className="flex w-full justify-center pt-2">
          <AdSlot variant="native" banner={AD_PLACEMENTS.feedNative} />
        </div>
      )}

      {/* Seamless in-page player for the highlights tab */}
      <HighlightPlayerModal highlight={activeHighlight} onClose={() => setActiveHighlight(null)} />
    </div>
  );
}
