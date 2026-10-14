'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Volume2, VolumeX, Maximize, X, Plus, Search, RefreshCw, Layers, ShieldAlert, Cpu } from 'lucide-react';
import Link from 'next/link';

export default function MultiStreamPage() {
  const [slots, setSlots] = useState([null, null, null, null]);
  const [sizes, setSizes] = useState([50, 50, 50, 50]); // Dynamic sizing percentages for the 4 slots
  const [availableMatches, setAvailableMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  const [resizingSlotIdx, setResizingSlotIdx] = useState(null);
  const arenaRef = useRef(null);

  const startResize = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizingSlotIdx(index);

    const isTouch = e.type.startsWith('touch');
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startSize = sizes[index] || 50;
    const parentWidth = arenaRef.current ? arenaRef.current.clientWidth : 1200;

    const handleMove = (moveEvent) => {
      const currentX = moveEvent.type.startsWith('touch') 
        ? moveEvent.touches[0].clientX 
        : moveEvent.clientX;
      const deltaX = currentX - startX;
      // Convert pixels to percentage of parent width
      const deltaPercent = (deltaX / parentWidth) * 100;
      let newSize = startSize + deltaPercent;
      // Clamp between 20% and 100%
      newSize = Math.max(20, Math.min(100, newSize));
      // Round for smoothness
      newSize = Math.round(newSize);

      setSizes((prev) => {
        const next = [...prev];
        next[index] = newSize;
        return next;
      });
    };

    const handleEnd = () => {
      setResizingSlotIdx(null);
      if (isTouch) {
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      } else {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
      }
    };

    if (isTouch) {
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    } else {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
    }
  };

  // Poll available matches
  const fetchMatches = async () => {
    try {
      const res = await fetch('/api/matches');
      const data = await res.json();
      if (data.matches) {
        setAvailableMatches(data.matches);
      }
    } catch (err) {
      console.error('Failed fetching matches:', err);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 20000);
    return () => clearInterval(interval);
  }, []);

  const openSelector = (slotIndex) => {
    setActiveSlot(slotIndex);
    setModalOpen(true);
  };

  const selectMatch = (match) => {
    if (activeSlot === null) return;
    const nextSlots = [...slots];
    nextSlots[activeSlot] = {
      id: match.id,
      title: match.title,
      homeName: match.homeTeam?.name,
      awayName: match.awayTeam?.name,
      homeBadge: match.homeTeam?.badge,
      awayBadge: match.awayTeam?.badge,
      status: match.status,
      timestamp: match.timestamp
    };
    setSlots(nextSlots);
    setModalOpen(false);
    setActiveSlot(null);
  };

  const removeSlot = (slotIndex) => {
    const nextSlots = [...slots];
    nextSlots[slotIndex] = null;
    setSlots(nextSlots);
  };

  const filteredMatches = availableMatches.filter(m => {
    const query = searchQuery.toLowerCase();
    const matchesTitle = m.title.toLowerCase().includes(query);
    const matchesHome = (m.homeTeam?.name || '').toLowerCase().includes(query);
    const matchesAway = (m.awayTeam?.name || '').toLowerCase().includes(query);
    const matchesTournament = (m.tournament || '').toLowerCase().includes(query);
    return matchesTitle || matchesHome || matchesAway || matchesTournament;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header and Control Dash */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border border-zinc-200/40 dark:border-navy-800 shadow-xl transition-all duration-300">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-lime-500 animate-pulse" />
            <h1 className="text-xl font-extrabold tracking-tight dark:text-white text-zinc-900">Multi-View Broadcast Arena</h1>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Monitor and watch up to 4 dynamic football streams concurrently in real time. Combine matches, toggle sound feeds, and customize layouts.
          </p>
          {/* Quick Help for Gestures */}
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-zinc-100 dark:border-navy-800/60 mt-2">
            <span className="font-extrabold text-lime-500">🎮 Hover Shortcuts:</span>
            <span>[A] Shield Toggle</span>
            <span>[S] Cycle Server</span>
            <span>[R] Refresh Feed</span>
            <span>[M] Mute</span>
            <span className="text-zinc-350 dark:text-zinc-700">|</span>
            <span className="font-extrabold text-lime-500">🖱️ Mouse Gestures:</span>
            <span>Double-Click Header to toggle Shield</span>
            <span>Right-Click Header to cycle servers</span>
            <span className="text-zinc-350 dark:text-zinc-700">|</span>
            <span className="font-bold text-lime-500">🔌 Qualities Provided:</span>
            <span>SD (480p/576p Std) & HD (720p/1080p High)</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSlots([null, null, null, null]);
            }}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600 dark:border-navy-750 dark:bg-navy-900 dark:hover:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-all"
          >
            Clear Arena
          </button>
          <button
            onClick={fetchMatches}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-650 dark:border-navy-750 dark:bg-navy-900 dark:hover:bg-zinc-800 dark:text-zinc-300 flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`h-3 w-3 ${loadingMatches ? 'animate-spin' : ''}`} />
            Refresh Scores
          </button>
        </div>
      </div>

      {/* Dynamic Viewports Arena */}
      <div 
        ref={arenaRef}
        className="flex flex-wrap gap-4 transition-all duration-500 ease-out select-none"
      >
        {slots.map((slot, idx) => {
          const currentSize = sizes[idx] || 50;
          return (
            <div 
              key={idx}
              style={{
                flex: `1 1 calc(${currentSize}% - 16px)`,
                width: `calc(${currentSize}% - 16px)`,
                maxWidth: '100%',
                minWidth: '290px',
              }}
              className={`relative rounded-2xl overflow-hidden bg-white/70 dark:bg-black/40 border border-zinc-200/50 dark:border-navy-800/60 shadow-lg aspect-video flex flex-col ${
                resizingSlotIdx === idx 
                  ? 'transition-none ring-2 ring-lime-500 shadow-lime-500/10 scale-[0.99]' 
                  : 'transition-all duration-500 ease-out'
              } ${
                slot ? 'ring-1 ring-lime-500/10' : 'border-dashed'
              }`}
            >
              {slot ? (
                <MultiStreamSlot 
                  slotData={slot} 
                  slotIndex={idx}
                  size={currentSize}
                  onResize={(newSize) => {
                    const nextSizes = [...sizes];
                    nextSizes[idx] = newSize;
                    setSizes(nextSizes);
                  }}
                  onRemove={() => removeSlot(idx)} 
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer group hover:bg-zinc-100/50 dark:hover:bg-navy-900/10 transition-all duration-300" onClick={() => openSelector(idx)}>
                  <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-navy-900 border border-zinc-200 dark:border-navy-800 flex items-center justify-center text-zinc-400 group-hover:text-lime-500 group-hover:scale-110 transition-all shadow-inner">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Slot {idx + 1}: Empty Screen</h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Click to mount a live stream in this view.</p>
                  </div>
                  <div className="pt-2 w-32" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[9px] font-extrabold text-zinc-450 dark:text-zinc-550 block mb-1">Set Screen Width: {currentSize}%</label>
                    <input 
                      type="range" 
                      min="25" 
                      max="100" 
                      step="5"
                      value={currentSize} 
                      onChange={(e) => {
                        const nextSizes = [...sizes];
                        nextSizes[idx] = parseInt(e.target.value);
                        setSizes(nextSizes);
                      }}
                      className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-lime-500" 
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Drag Edge Resize Handle */}
              <div 
                onMouseDown={(e) => startResize(e, idx)}
                onTouchStart={(e) => startResize(e, idx)}
                className="absolute top-0 right-0 bottom-0 w-3 hover:w-4 bg-zinc-400/0 hover:bg-lime-500/10 active:bg-lime-600/20 cursor-col-resize z-30 transition-all duration-150 flex items-center justify-center group/handle"
                title="Drag right border to resize screen width"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-1.5 h-14 rounded-full bg-zinc-300/10 border border-zinc-250/20 dark:border-navy-750 group-hover/handle:bg-zinc-450/45 group-hover/handle:border-lime-500/20 group-active/handle:bg-lime-500 group-active/handle:border-lime-500/50 transition-all shadow-sm flex flex-col justify-between py-1 items-center select-none text-zinc-400/40 group-hover/handle:text-zinc-400/80 group-active/handle:text-white">
                  <span className="w-0.5 h-0.5 bg-current rounded-full" />
                  <span className="w-0.5 h-0.5 bg-current rounded-full" />
                  <span className="w-0.5 h-0.5 bg-current rounded-full" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Match Selector Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl glass-panel border border-zinc-200 dark:border-navy-800 bg-white dark:bg-[#0b132b] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-navy-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 dark:text-white">Mount Live Fixture</h3>
                <p className="text-[11px] text-zinc-400">Mount a stream into Screen Slot {activeSlot + 1}</p>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-navy-900 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search teams, tournament, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-navy-950 dark:border-navy-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500 transition-all"
              />
            </div>

            {/* Match List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {loadingMatches ? (
                <div className="py-12 text-center text-xs text-zinc-400 font-semibold flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-lime-500" />
                  Updating live rosters...
                </div>
              ) : filteredMatches.length > 0 ? (
                filteredMatches.map((m) => {
                  const alreadySelected = slots.some(s => s && s.id === m.id);
                  return (
                    <div 
                      key={m.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        alreadySelected 
                          ? 'border-zinc-100 bg-zinc-50/50 dark:border-navy-800 dark:bg-navy-900/10 opacity-60' 
                          : 'border-zinc-200/60 hover:border-zinc-300 bg-white hover:bg-zinc-50 dark:border-navy-800 dark:bg-navy-950 dark:hover:bg-navy-900/60'
                      }`}
                    >
                      <div className="text-left space-y-1.5 max-w-[70%]">
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-650 dark:bg-navy-900 dark:text-zinc-400 border border-zinc-200/60 dark:border-navy-800">
                          {m.tournament || 'Live Stream'}
                        </span>
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          <span>{m.homeTeam?.name}</span>
                          <span className="text-zinc-400 dark:text-zinc-500 font-medium">vs</span>
                          <span>{m.awayTeam?.name}</span>
                        </div>
                        {m.status === 'live' && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-lime-500 live-dot" />
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-500">Live</span>
                            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                              {m.homeScore} - {m.awayScore} ({m.currentMinute})
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <button
                        disabled={alreadySelected}
                        onClick={() => selectMatch(m)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                          alreadySelected
                            ? 'border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-navy-800 dark:bg-navy-950 dark:text-zinc-600'
                            : 'border-lime-400 bg-lime-500 hover:bg-lime-400 text-navy-950 shadow-md shadow-lime-600/20 active:scale-95'
                        }`}
                      >
                        {alreadySelected ? 'Added' : 'Mount Stream'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-xs text-zinc-550 dark:text-zinc-500 font-semibold">
                  No match fixtures found matching your search.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Slot Viewport Component loading streams dynamically */
function MultiStreamSlot({ slotData, slotIndex, size, onResize, onRemove }) {
  const [streams, setStreams] = useState([]);
  const [activeStreamIdx, setActiveStreamIdx] = useState(0);
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(slotIndex > 0); // Mute slot 2, 3, 4 by default so they don't blast concurrently!
  const [isPlaying, setIsPlaying] = useState(true);
  const [sandboxShield, setSandboxShield] = useState(false);
  const [hlsLoaded, setHlsLoaded] = useState(false);
  
  // Custom Hover State & Gestures
  const [isHovered, setIsHovered] = useState(false);
  const [gestureToast, setGestureToast] = useState(null);
  const [dragStartX, setDragStartX] = useState(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const longPressTimerRef = useRef(null);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const activeStream = streams[activeStreamIdx];
  const streamUrl = activeStream?.proxiedUrl || activeStream?.url;
  const isDirectHls = streamUrl && (
    streamUrl.includes('.m3u8') || 
    streamUrl.includes('.mpd') || 
    streamUrl.includes('/hls/') || 
    streamUrl.includes('.mp4')
  );

  const showToast = (message) => {
    setGestureToast(message);
    setTimeout(() => {
      setGestureToast((prev) => prev === message ? null : prev);
    }, 2200);
  };

  // Keyboard gestures handler when hovering over this viewport
  useEffect(() => {
    if (!isHovered) return;

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      
      // Don't capture standard browser inputs if user is typing elsewhere
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (key === 'a') {
        e.preventDefault();
        setSandboxShield((prev) => {
          const next = !prev;
          showToast(next ? '🛡️ Shield: ON (Sandbox Shield Active)' : '⚠️ Shield: OFF (Sandbox Shield Inactive)');
          return next;
        });
      } else if (key === 's') {
        e.preventDefault();
        if (streams.length > 1) {
          setActiveStreamIdx((prev) => {
            const next = (prev + 1) % streams.length;
            showToast(`🔌 Feed: Server ${next + 1} (${streams[next]?.quality || 'SD'})`);
            return next;
          });
        } else {
          showToast('ℹ️ Feed: Only 1 server available');
        }
      } else if (key === 'r') {
        e.preventDefault();
        reloadFeed();
        showToast('🔄 Feed: Reloading Stream...');
      } else if (key === 'm') {
        e.preventDefault();
        toggleMute();
        showToast(muted ? '🔊 Feed: Unmuted' : '🔇 Feed: Muted');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovered, streams, activeStreamIdx, muted, streamUrl, isDirectHls]);

  // Load HLS Client script if HLS stream is resolved
  useEffect(() => {
    if (!isDirectHls) return;
    if (window.Hls) {
      setHlsLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.0/dist/hls.min.js';
    script.async = true;
    script.onload = () => setHlsLoaded(true);
    document.body.appendChild(script);
  }, [isDirectHls]);

  // Resolve streams from custom stream API endpoint
  useEffect(() => {
    const resolveStreams = async () => {
      setResolving(true);
      setError(null);
      try {
        const res = await fetch(`/api/streams/${slotData.id}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else if (data.streams && data.streams.length > 0) {
          setStreams(data.streams);
          setActiveStreamIdx(0);
        } else {
          setError('No active servers found.');
        }
      } catch (err) {
        setError('Failed resolving video feeds.');
      } finally {
        setResolving(false);
      }
    };
    resolveStreams();
  }, [slotData.id]);

  // HLS Direct Playback setup
  useEffect(() => {
    if (!isDirectHls || !hlsLoaded || !videoRef.current) return;

    const video = videoRef.current;
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.muted = muted;
    setIsPlaying(true);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
    } else if (window.Hls) {
      const hls = new window.Hls({
        maxBufferSize: 10 * 1024 * 1024,
        maxBufferLength: 15,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, isDirectHls, hlsLoaded, muted]);

  // Volume toggle
  const toggleMute = () => {
    const nextMute = !muted;
    setMuted(nextMute);
    if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
  };

  const reloadFeed = () => {
    if (videoRef.current && isDirectHls) {
      if (hlsRef.current) {
        hlsRef.current.loadSource(streamUrl);
        hlsRef.current.startLoad();
      } else {
        videoRef.current.src = streamUrl;
        videoRef.current.load();
      }
    } else {
      // Toggle key reload for iframe components
      const curr = activeStreamIdx;
      setActiveStreamIdx(-1);
      setTimeout(() => setActiveStreamIdx(curr), 50);
    }
  };

  // Header Gestures
  const handleHeaderStart = (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
    setDragDeltaX(0);
    setIsDraggingHeader(true);
    setIsLongPress(false);

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      setIsLongPress(true);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch (_) {}
      }
      setSandboxShield((prev) => {
        const next = !prev;
        showToast(next ? '🛡️ Shield: ON (Sandbox Shield Active)' : '⚠️ Shield: OFF (Sandbox Shield Inactive)');
        return next;
      });
    }, 600);
  };

  const handleHeaderMove = (e) => {
    if (!isDraggingHeader || dragStartX === null) return;
    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - dragStartX;
    setDragDeltaX(deltaX);

    if (Math.abs(deltaX) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleHeaderEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!isDraggingHeader) return;
    setIsDraggingHeader(false);

    if (isLongPress) {
      setDragStartX(null);
      setDragDeltaX(0);
      setIsLongPress(false);
      return;
    }

    if (Math.abs(dragDeltaX) > 60) {
      if (streams.length > 1) {
        if (dragDeltaX > 0) {
          // Swipe Right -> Previous Server
          setActiveStreamIdx((prev) => {
            const next = (prev - 1 + streams.length) % streams.length;
            showToast(`🔌 Feed: Server ${next + 1} (${streams[next]?.quality || 'SD'})`);
            return next;
          });
        } else {
          // Swipe Left -> Next Server
          setActiveStreamIdx((prev) => {
            const next = (prev + 1) % streams.length;
            showToast(`🔌 Feed: Server ${next + 1} (${streams[next]?.quality || 'SD'})`);
            return next;
          });
        }
      } else {
        showToast('ℹ️ Feed: Only 1 server available');
      }
    }

    setDragStartX(null);
    setDragDeltaX(0);
  };

  const handleHeaderDoubleClick = (e) => {
    e.stopPropagation();
    setSandboxShield((prev) => {
      const next = !prev;
      showToast(next ? '🛡️ Shield: ON (Sandbox Shield Active)' : '⚠️ Shield: OFF (Sandbox Shield Inactive)');
      return next;
    });
  };

  const handleHeaderRightClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (streams.length > 1) {
      setActiveStreamIdx((prev) => {
        const next = (prev + 1) % streams.length;
        showToast(`🔌 Feed: Server ${next + 1} (${streams[next]?.quality || 'SD'})`);
        return next;
      });
    } else {
      showToast('ℹ️ Feed: Only 1 server available');
    }
  };

  const handleWheelServer = (e) => {
    if (streams.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY > 0) {
      setActiveStreamIdx((prev) => (prev + 1) % streams.length);
      showToast(`🔌 Server Cycle: Next Feed`);
    } else {
      setActiveStreamIdx((prev) => (prev - 1 + streams.length) % streams.length);
      showToast(`🔌 Server Cycle: Previous Feed`);
    }
  };

  return (
    <div 
      className="flex-1 flex flex-col h-full w-full relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gesture Pill Toast Notification */}
      {gestureToast && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none transition-all duration-300">
          <div className="px-4 py-2.5 bg-black/90 dark:bg-black/85 backdrop-blur-md border border-lime-500/35 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-full shadow-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-ping" />
            {gestureToast}
          </div>
        </div>
      )}

      {/* Swipe Feedback Overlay */}
      {isDraggingHeader && Math.abs(dragDeltaX) > 20 && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-35 flex items-center justify-center pointer-events-none transition-all duration-250 select-none">
          <div className="px-5 py-3 bg-navy-950/90 border border-lime-500/40 text-white rounded-2xl flex flex-col items-center gap-2 shadow-2xl scale-100 transform transition-transform">
            <span className="text-2xl animate-pulse">
              {dragDeltaX > 0 ? '👈' : '👉'}
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-wider">
              {dragDeltaX > 0 ? 'Swipe Right: Previous Feed' : 'Swipe Left: Next Feed'}
            </span>
            <span className="text-[9px] text-zinc-400 font-semibold mt-1">
              Release to switch (Offset: {Math.round(dragDeltaX)}px)
            </span>
          </div>
        </div>
      )}

      {/* Title HUD Bar */}
      <div 
        onMouseDown={handleHeaderStart}
        onMouseMove={handleHeaderMove}
        onMouseUp={handleHeaderEnd}
        onMouseLeave={handleHeaderEnd}
        onTouchStart={handleHeaderStart}
        onTouchMove={handleHeaderMove}
        onTouchEnd={handleHeaderEnd}
        onDoubleClick={handleHeaderDoubleClick}
        onContextMenu={handleHeaderRightClick}
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto cursor-grab active:cursor-grabbing select-none"
        title="Swipe Left/Right: Cycle Servers | Hold 600ms or Double Click: Toggle Shield | Right Click: Cycle Server"
      >
        <div className="flex items-center gap-2 max-w-[65%]">
          <span className={`h-1.5 w-1.5 rounded-full ${slotData.status === 'live' ? 'bg-lime-500 live-dot' : 'bg-zinc-500'}`} />
          <span className="text-[10px] font-extrabold text-white truncate drop-shadow-md">
            Screen {slotIndex + 1}: {slotData.homeName} vs {slotData.awayName}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Server Switcher Dropdown (With Wheel gesture cycle capability) */}
          {streams.length > 1 && (
            <select
              value={activeStreamIdx}
              onWheel={handleWheelServer}
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                setActiveStreamIdx(idx);
                showToast(`🔌 Switched to Server ${idx + 1}`);
              }}
              className="text-[9px] font-extrabold uppercase px-1 py-0.5 rounded bg-black/60 border border-navy-750 text-white cursor-pointer focus:outline-none"
              title="Scroll wheel over select to cycle feeds"
            >
              {streams.map((s, index) => (
                <option key={index} value={index} className="bg-navy-950">
                  S{index + 1} ({s.quality || 'SD'})
                </option>
              ))}
            </select>
          )}

          {/* Close Screen Slot */}
          <button 
            onClick={onRemove}
            className="p-1 rounded bg-black/50 hover:bg-red-600 border border-navy-750/60 text-zinc-300 hover:text-white transition-colors"
            title="Unmount Stream"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Screen Stream Body */}
      <div 
        className="flex-1 w-full bg-black relative flex items-center justify-center"
        onDoubleClick={handleHeaderDoubleClick}
      >
        {resolving ? (
          <div className="flex flex-col items-center justify-center space-y-2.5">
            <RefreshCw className="h-6 w-6 text-lime-500 animate-spin" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Resolving Streaming Signals...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-2 max-w-xs">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            <h4 className="text-xs font-bold text-zinc-300">Shield Restrained</h4>
            <p className="text-[10px] text-zinc-500">{error}</p>
          </div>
        ) : isDirectHls ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-contain cursor-pointer"
            playsInline
            onClick={handlePlayPause}
          />
        ) : activeStreamIdx === -1 ? (
          <div className="flex items-center justify-center">
            <RefreshCw className="h-5 w-5 text-zinc-500 animate-spin" />
          </div>
        ) : sandboxShield ? (
          <iframe
            key={`${streamUrl}-secured`}
            src={streamUrl}
            className="absolute inset-0 h-full w-full border-0"
            allowFullScreen
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          />
        ) : (
          <iframe
            key={`${streamUrl}-compat`}
            src={streamUrl}
            className="absolute inset-0 h-full w-full border-0"
            allowFullScreen
            allow="autoplay; fullscreen"
          />
        )}
      </div>

      {/* Screen HUD controls (bottom overlay on hover) */}
      {!resolving && !error && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300 z-20">
          <div className="flex items-center gap-2">
            {/* Play/Pause (HLS only) */}
            {isDirectHls && (
              <button
                onClick={handlePlayPause}
                className="p-1 rounded bg-black/60 hover:bg-white/10 text-white transition-colors"
              >
                {isPlaying ? <VolumeX className="h-3 w-3" /> : <Play className="h-3 w-3 fill-white" />}
              </button>
            )}

            {/* Mute/Unmute toggle */}
            <button
              onClick={toggleMute}
              className={`p-1 rounded transition-colors ${
                muted ? 'bg-red-600/40 text-red-400 hover:bg-red-600/60' : 'bg-black/60 text-white hover:bg-white/10'
              }`}
              title={muted ? "Unmute Feed" : "Mute Feed"}
            >
              {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Dynamic Screen Sizing Slider */}
            <div className="flex items-center gap-1.5 bg-black/60 border border-navy-750/80 px-2 py-0.5 rounded-lg select-none">
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-400">Size: {size}%</span>
              <input
                type="range"
                min="25"
                max="100"
                step="5"
                value={size}
                onChange={(e) => onResize(parseInt(e.target.value))}
                className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-lime-500"
                title="Drag to resize screen width"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Iframe Sandbox Toggle */}
            {!isDirectHls && (
              <button
                onClick={() => {
                  setSandboxShield((prev) => {
                    const next = !prev;
                    showToast(next ? '🛡️ Shield: ON (Sandbox Shield Active)' : '⚠️ Shield: OFF (Sandbox Shield Inactive)');
                    return next;
                  });
                }}
                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border transition-all ${
                  sandboxShield 
                    ? 'border-green-500/40 bg-green-600/10 text-green-400' 
                    : 'border-navy-750 bg-black/60 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Toggle Iframe Sandbox Shields"
              >
                Shield {sandboxShield ? 'ON' : 'OFF'}
              </button>
            )}

            {/* Refresh stream */}
            <button
              onClick={() => {
                reloadFeed();
                showToast('🔄 Feed Reloaded');
              }}
              className="p-1 rounded bg-black/60 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
              title="Refresh Screen Feed"
            >
              <RefreshCw className="h-3 w-3" />
            </button>

            {/* Fullscreen (HLS direct only) */}
            {isDirectHls && (
              <button
                onClick={handleFullscreen}
                className="p-1 rounded bg-black/60 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                title="Fullscreen Feed"
              >
                <Maximize className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
