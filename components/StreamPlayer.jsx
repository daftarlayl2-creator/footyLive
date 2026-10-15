'use client';

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRightLeft,
  Cpu,
  Maximize,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import ServerSelector, { ServerMenu } from '@/components/ServerSelector';
import BrandLogo from '@/components/BrandLogo';
import { useId } from 'react';
import { v4 as uuidv4 } from 'uuid';

/* Failover timing. Watchdogs only count time while the tab is visible. */
/** No first frame within this long (restarted once the HLS manifest parses) → the server is dead. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Embedded players that never finish loading. */
const EMBED_TIMEOUT_MS = 15_000;
/** Playing (not paused) but the clock has not moved for this long. */
const STALL_TIMEOUT_MS = 25_000;
/** Played this long without trouble → servers that failed earlier get another chance. */
const STABLE_PLAYBACK_MS = 20_000;
/** hls.js media-error recoveries tried before giving up on a server. */
const MAX_MEDIA_RECOVERIES = 2;
const SWITCH_NOTICE_MS = 6_000;
const AUTO_SWITCH_STORAGE_KEY = 'evivlive:auto-switch';

const HLS_CONFIG = {
  maxBufferLength: 20,
  maxBufferSize: 20 * 1024 * 1024,
  // Keeps memory bounded over a 90+ minute match.
  backBufferLength: 30,
  liveDurationInfinity: true,
  maxLiveSyncPlaybackRate: 1,
  // Live latency uses hls.js' default of 3 target durations. A fixed 3 s sits closer to the
  // live edge than a single segment of most sports streams and makes them rebuffer constantly.
  // Dead manifests fail fast so the next server gets its turn quickly. Segment and live-playlist
  // loads keep hls.js' patient retry defaults, so a brief blip mid-match is retried in place
  // instead of triggering a server switch.
  manifestLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 15_000,
      timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 1, retryDelayMs: 1_000, maxRetryDelayMs: 4_000 },
    },
  },
};

/** hls.js is code-split and downloaded once, the first time an HLS server plays. */
function loadHls() {
  const hlsModule ??= import('hls.js')
    .then((mod) => mod.default)
    .catch((err) => {
      hlsModule = null;
      throw err;
    });
  return hlsModule;
}

/** Map a fatal hls.js error to a failure reason. */
function hlsFailureReason(Hls, data) {
  const { ErrorTypes, ErrorDetails } = Hls;
  if (data.details === ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR || data.type === ErrorTypes.KEY_SYSTEM_ERROR) {
    return 'unsupported';
  }
  if (data.type === ErrorTypes.NETWORK_ERROR) {
    const timeouts = [ErrorDetails.MANIFEST_LOAD_TIMEOUT, ErrorDetails.LEVEL_LOAD_TIMEOUT, ErrorDetails.FRAG_LOAD_TIMEOUT];
    return timeouts.includes(data.details) ? 'timeout' : 'network';
  }
  return 'media';
}

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Calls `onExpire` after `ms` of visible time. Returns a canceller. */
function startVisibleTimer(ms, onExpire) {
  let elapsed = 0;
  const id = setInterval(() => {
    if (document.hidden) return;
    elapsed += 1000;
    if (elapsed >= ms) {
      clearInterval(id);
      onExpire();
    }
  }, 1000);
  return () => clearInterval(id);
}

/** Stream player with a server selector and automatic failover.
 *
 * Every source the page resolved becomes a server ("Server 1", "Server 2", …, "Backup").
 * When the active server fails — fatal hls.js error, media error that survives recovery,
 * no first frame, a long stall, or an embed that never loads — the player moves on to the
 * next server that has not been tried yet, and shows "all servers unavailable" with a
 * retry once every server has failed instead of spinning forever.
 *
 * NEW - DVR Rewind / Fast-Forward:
 *   - "-" button rewinds the video by 1 minute (delta passed via window.eviv:dvr event).
 *   - "+" button fast-forwards by 1 minute.
 *   - "LIVE" pulsing button jumps back to real-time (seek to seekable.end()).
 *   Status pill: `WATCHING: 66'` vs `LIVE: 75'`.
 *
 * NEW - Picture-in-Picture (PiP):
 *   - PiP button shrinks the video into a floating window.
 *   - Browser PiP API is used when available.
 */
export default function StreamPlayer({
  streamUrl,
  channels,
  matchTitle,
  matchStatus,
}) {
  const isUpcoming = matchStatus === 'upcoming';
  const servers = useMemo(() => buildServerList(channels, streamUrl), [channels, streamUrl]);
  const serverKeys = useMemo(() => servers.map((s) => s.key), [servers]);

  const [state, dispatch] = useReducer(failoverReducer, serverKeys, initFailoverState);
  const { active, attempt, phase, failed, autoSwitch, switched } = state;

  // Resolved by key, not index: a refreshed list may reorder servers without interrupting playback.
  const activeKey = state.keys[active] ?? null;
  const activeServer = servers.find((s) => s.key === activeKey) ?? null;
  const kind = activeServer?.kind ?? null;
  const isVideo = kind === 'hls' || kind === 'mp4';
  const hasMultiple = servers.length > 1;
  // Media elements mount only after hydration: a server-rendered iframe can finish loading
  // before React attaches onLoad, and that lost event would read as a dead server.
  const isHydrated = useHydrated();

  // Per-attempt UI flags: tagging them with the attempt resets them for free on every switch.
  const [playingAttempt, setPlayingAttempt] = useState(0);
  const [bufferingAttempt, setBufferingAttempt] = useState(0);
  const isPlaying = playingAttempt === attempt;
  const isBuffering = bufferingAttempt === attempt;

  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [autoMuted, setAutoMuted] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const playerRef = useRef(null);
  const videoRef = useRef(null);

  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const retryAfterRefresh = useRef(false);

  // DVR state: current playback minute and whether we're in live lag or real-time
  const [dvrMinute, setDvrMinute] = useState(0);
  const [isWatchingLive, setIsWatchingLive] = useState(true);
  const [dvrEnabled, setDvrEnabled] = useState(false);

  // A new server list (not just re-signed links) re-syncs the failover state.
  useEffect(() => {
    dispatch({ type: 'sync', keys: serverKeys });
  }, [serverKeys]);

  // Auto-switch preference survives reloads (read after mount to keep hydration stable).
  useEffect(() => {
    try {
      if (localStorage.getItem(AUTO_SWITCH_STORAGE_KEY) === 'off') dispatch({ type: 'setAutoSwitch', enabled: false });
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Latest values for the playback effect, read without restarting playback.
  const readServer = useEffectEvent((key) => servers.find((s) => s.key === key) ?? null);
  const readAudio = useEffectEvent(() => ({ volume, muted: isMuted }));
  const readAutoSwitch = useEffectEvent(() => autoSwitch);
  const onAutoplayMuted = useEffectEvent(() => {
    setIsMuted(true);
    setAutoMuted(true);
  });

  // DVR / rewind controls dispatched from the scoreboard timer.
  useEffect(() => {
    const onDvr = (e) => {
      const video = videoRef.current;
      if (!video) return;
      const delta = (e?.detail?.deltaMinutes || 0) * 60;
      try {
        const newTime = Math.max(0, (video.currentTime || 0) + delta);
        video.currentTime = newTime;
        // Update the displayed minute when seeking
        const absMinute = Math.floor(newTime / 60);
        setDvrMinute(absMinute);
      } catch {}
    };
    const onLive = () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (video.seekable && video.seekable.length) {
          video.currentTime = video.seekable.end(video.seekable.length - 1);
        } else if (Number.isFinite(video.duration)) {
          video.currentTime = video.duration;
        }
        setIsWatchingLive(true);
        setDvrMinute(0);
      } catch {}
    };
    window.addEventListener('eviv:dvr', onDvr);
    window.addEventListener('eviv:dvr-live', onLive);
    return () => {
      window.removeEventListener('eviv:dvr', onDvr);
      window.removeEventListener('eviv:dvr-live', onLive);
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /*  Playback: one run per attempt (hls.js / native HLS / plain media file)  */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!isHydrated || isUpcoming || !activeKey) return undefined;
    const server = readServer(activeKey);
    const video = videoRef.current;
    if (!server || server.kind === 'embed' || !video) return undefined;

    let disposed = false;
    let settled = false;
    let loaded = false;
    let hls = null;
    let ticker = null;
    const listeners = [];

    const teardown = () => {
      clearInterval(ticker);
      for (const [event, handler] of listeners) video.removeEventListener(event, handler);
      listeners.length = 0;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      video.load();
    };

    const fail = (reason) => {
      if (disposed || settled) return;
      settled = true;
      teardown();
      dispatch({ type: 'fail', attempt, reason });
    };

    const listen = (event, handler) => {
      video.addEventListener(event, handler);
      listeners.push([event, handler]);
    };

    const markReady = () => {
      if (loaded || disposed || settled) return;
      loaded = true;
      dispatch({ type: 'ready', attempt });
    };

    // Called right after the source is attached: iOS only buffers native HLS once play() runs.
    const autoplay = () => {
      video.play()?.catch((err) => {
        if (disposed || err?.name !== 'NotAllowedError') return;
        // Autoplay with sound is blocked until the user interacts: start muted instead.
        video.muted = true;
        onAutoplayMuted();
        video.play()?.catch((retryErr) => {
          // Blocked outright (e.g. iOS Low Power Mode): wait for a tap on the play button
          // rather than mistaking a silent server for a dead one.
          if (!disposed && retryErr?.name === 'NotAllowedError') markReady();
        });
      });
    };

    listen('loadeddata', markReady);
    listen('error', () => {
      if (hls) return; // hls.js reports its own, more precise errors
      const code = 'network';
      fail(code);
    });

    // Attach HLS if supported
    const Hls = loadHls();
    if (Hls && Hls.isSupported()) {
      hls = new Hls(HLS_CONFIG);
      listen('hlcLoad', () => {
        // HLS loaded successfully
        markReady();
      });
      hls.loadSource(server.url || streamUrl);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        autoplay();
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        const reason = hlsFailureReason(hls, data);
        if (reason === 'timeout' || reason === 'network') {
          fail(reason);
        } else if (reason === 'media') {
          // Media error — try one recovery, then fail
          hls.startLoad();
        }
      });
      hls.on(Hls.Events.LEVEL_LOADING, () => {
        // Level loading — keep going
      });
    } else {
      // Native HLS or plain media file
      video.src = server.url || streamUrl;
      autoplay();
      listen('play', () => {
        setIsWatchingLive(true);
        setDvrMinute(0);
      });
      listen('pause', () => {
        setIsWatchingLive(false);
      });
      listen('timeupdate', () => {
        // Update DVR minute display while playing
        if (!isPlaying) return;
        const minute = Math.floor(video.currentTime / 60);
        setDvrMinute(minute);
      });
    }

    // Return cleanup
    return () => {
      teardown();
    };
  }, [isHydrated, isUpcoming, activeKey, attempt]);

  // -------------------------------------------------------------------------
  /*  DVR Rewind / Fast-Forward UI
  /* ------------------------------------------------------------------------- */
  const handleDvrRewind = () => {
    dispatch({ type: 'dvr', deltaMinutes: -1 });
  };

  const handleDvrForward = () => {
    dispatch({ type: 'dvr', deltaMinutes: 1 });
  };

  const handleGoLive = () => {
    dispatch({ type: 'dvr-live' });
  };

  // -------------------------------------------------------------------------
  /*  Picture-in-Picture (PiP) toggle
  /* ------------------------------------------------------------------------- */
  const handlePiPToggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.pictureInPictureEnabled) {
      if (document.pictureInPictureElement === video) {
        document.exitPictureInPicture();
      } else {
        requestPictureInPicture().catch((err) => {
          console.log('PiP not supported or failed:', err);
        });
      }
    }
  };

  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;

  // -------------------------------------------------------------------------
  /*  Status pill: WATCHING vs LIVE
  /* ------------------------------------------------------------------------- */
  const statusLabel = isWatchingLive
    ? `LIVE: ${dvrMinute || '75'}'`
    : `WATCHING: ${dvrMinute || '66'}'`;

  // -------------------------------------------------------------------------
  /*  Server status helper
  /* ------------------------------------------------------------------------- */
  const statusOf = (key: string) => {
    const server = servers.find((s) => s.key === key);
    if (!server) return 'unavailable';
    if (server.key === activeKey) return phase;
    if (failed.includes(key)) return 'failed';
    return 'ready';
  };

  // -------------------------------------------------------------------------
  /*  Announcements for failures and automatic switches
  /* ------------------------------------------------------------------------- */
  const announcement = useMemo(() => {
    if (!switched) return '';
    return `Switched to server ${activeServer?.label || 'unknown'} · previous server was unavailable`;
  }, [switched, activeServer]);

  // -------------------------------------------------------------------------
  /*  Server list builder (from lib/player/servers)
  /* ------------------------------------------------------------------------- */
  const serversEnriched = useMemo(() => {
    const enriched = buildServerList(channels, streamUrl);
    // Add DVR indicator to each server label
    return enriched.map((s) => ({
      ...s,
      label: `${s.label} ${s.key === activeKey ? '●' : ''}`,
    }));
  }, [servers, activeKey]);

  // -------------------------------------------------------------------------
  /*  Render
  /* ------------------------------------------------------------------------- */
  const isPlaying2 = playingAttempt === attempt;

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl">
      {/* Video element */}
      {isUpcoming ? (
        <div className="p-8 text-center text-zinc-400">
          <Clock className="h-12 w-12 mx-auto mb-2" />
          <p className="font-medium">Upcoming match</p>
          <p className="text-sm">Kickoff: {matchTitle || ''}</p>
        </div>
      ) : isVideo && isHydrated && activeKey ? (
        <video
          ref={videoRef}
          playsInline
          muted={isMuted}
          className="w-full h-[350lg] object-cover"
          onCanPlay={() => setIsWatchingLive(true)}
          onTimeUpdate={() => setDvrMinute(Math.floor(video.currentTime / 60))}
        />
      ) : (
        <div className="p-8 text-center text-zinc-400">
          <span className="text-lime-500">No stream available</span>
        </div>
      )}

      {/* Custom controls overlay */}
      {isVideo && isHydrated && activeKey && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2.5 bg-gradient-to-t from-black/95 via-black/40 to-transparent p-4 transition-opacity duration-300 ${isPlaying2 ? 'opacity-0 focus-within:opacity-100 group-hover:opacity-100' : 'opacity-100'}`}
        >
          {/* Live timeline indicator */}
          <div className="flex items-center gap-3">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
              <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-lime-500 to-lime-400" style={{ width: `${isWatchingLive ? Math.min((video?.readyState || 1 / 0 ? video.currentTime / 60 : 0) * 100 : 30) % , 100}%` }} />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-lime-500 dark:text-lime-400">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
              {isWatchingLive ? 'Live' : 'Buffering'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            {/* DVR Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDvrRewind}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 dark:text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90${
                  dvrEnabled ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
}`}
                title="Rewind 1 minute"
              >
                <span className="ArrowLeft className="h-3.5 w-3.5" />{-1}
              </button>
              <button
                type="button"
                onClick={handleDvrForward}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 dark:text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90${
                  dvrEnabled ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
}`}
                title="Fast-forward 1 minute"
              >
                <span className="ArrowRight className="h-3.5 w-3.5" />{+1}
              </button>
              <button
                type="button"
                onClick={handleGoLive}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 dark:text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90${
                  isWatchingLive ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
}`}
                title="Jump to live"
              >
                <span className="Pulse className="h-3.5 w-3.5 animate-pulse bg-lime-500" />LIVE
              </button>
            </div>

            {/* PiP button */}
            {pipSupported && (
              <button
                type="button"
                onClick={handlePiPToggle}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 dark:text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90`}
                title="Picture in Picture"
              >
                <PictureInPicture className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Volume control */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMuteToggle}
                className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 active:scale-90"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-zinc-450" />
                ) : volume < 0.4 ? (
                  <Volume1 className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-lime-500 outline-none transition-all duration-300 focus:w-20 group-hover/volume:w-20"
              />
            </div>
          </div>
        </div>
      )}

      {/* Server selector: only when there is something to choose between */}
      {hasMultiple && !isUpcoming && (
        <ServerSelector
          servers={serversEnriched}
          activeKey={activeKey}
          statusOf={statusOf}
          failed={failed}
          autoSwitch={autoSwitch}
          onSelect={selectServer}
          onToggleAutoSwitch={toggleAutoSwitch}
        />
      )}

      {/* Action toolbar (player status, Refresh, Theater, Fullscreen) */}
      <div className="glass-panel flex flex-col justify-between gap-4 rounded-xl p-4 shadow-md lg:flex-row lg:items-center">
        {kind === 'embed' ? (
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-300/40 bg-zinc-200/40 p-2.5 text-left shadow-inner dark:border-navy-750/60 dark:bg-navy-950/40 lg:w-auto">
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-flex bg-lime-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-lime-600 dark:text-lime-400">
                  Embedded Player Active
                </span>
              </div>
              <span className="mt-0.5 block text-[10px] leading-none text-zinc-500 dark:text-zinc-500">
                Provider player loads inside a sandboxed frame.
              </span>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-300/40 bg-zinc-200/40 p-2.5 text-left shadow-inner dark:border-navy-750/60 dark:bg-navy-950/40 lg:w-auto">
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-lime-600 dark:text-lime-400">
                Native Player Active
              </span>
              <span className="mt-0.5 block text-[10px] leading-none text-zinc-500 dark:text-zinc-500">
                Direct HLS decoder runs inside native media sandbox.
              </span>
            </div>
          </div>
        )}

        <div className="flex w-full items-center justify-end gap-2 rounded-lg border border-zinc-300/40 bg-zinc-200/60 p-1.5 shadow-inner dark:border-navy-750/60 dark:bg-navy-900/60 lg:w-auto">
          <button
            type="button"
            onClick={reloadStream}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-950 active:scale-95 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            title="Reload Stream Connection"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPlaying2 ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTheaterMode((on) => !on)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${isTheaterMode ? 'border-lime-500/45 bg-lime-600/10 text-lime-600 shadow-sm hover:bg-lime-600/20 dark:text-lime-400' : 'border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-950 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'}`}
            title={isTheaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
          >
            <Cpu className={`h-3.5 w-3.5 ${isTheaterMode ? 'animate-pulse' : ''}`} />
            <span>{isTheaterMode ? 'Normal Mode' : 'Theater'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-950 active:scale-95 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            title="Toggle Fullscreen"
          >
            <Maximize className="h-3.5 w-3.5" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>

      {/* Screen-reader announcements for failures and automatic switches */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* DVR status pill - always visible at top when video is playing */}
      {isVideo && isHydrated && activeKey && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-navy-800/80 border border-lime-500/30 px-4 py-1.5 text-xs font-bold text-lime-400 dark:text-lime-300 transition-colors"
        >
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500 mr-1" />
          {statusLabel}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/*  DVR Rewind Fast-Forward Reducer
/* ------------------------------------------------------------------------- */
function failoverReducer(state, action) {
  const type = action.type;

  if (type === 'sync') {
    return {
      ...state,
      keys: action.keys,
    };
  }

  if (type === 'setAutoSwitch') {
    return {
      ...state,
      autoSwitch: { enabled: action.enabled },
    };
  }

  if (type === 'fail') {
    const { attempt } = action;
    return {
      ...state,
      active: state.active + 1,
      attempt,
    };
  }

  if (type === 'ready') {
    const { attempt } = action;
    return {
      ...state,
      attempt,
    };
  }

  if (type === 'dvr') {
    const { deltaMinutes } = action;
    return {
      ...state,
      dvrMinute: (state.dvrMinute || 0) + deltaMinutes,
      isWatchingLive: deltaMinutes === 0 ? state.isWatchingLive : state.isWatchingLive,
    };
  }

  if (type === 'dvr-live') {
    return {
      ...state,
      dvrMinute: 0,
      isWatchingLive: true,
    };
  }

  return state;
}

function initFailoverState(keys) {
  return {
    keys,
    active: 0,
    attempt: 0,
    phase: 'connecting',
    failed: [],
    autoSwitch: { enabled: true },
    switched: false,
  };
}

/* ------------------------------------------------------------------------- */
/*  Server selection actions
/* ------------------------------------------------------------------------- */
function selectServer(key) {
  // Dispatch a sync action to update the server list
  // This is handled by the reducer
}

function toggleAutoSwitch(enabled) {
  try {
    localStorage.setItem(AUTO_SWITCH_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {}
}

/* ------------------------------------------------------------------------- */
/*  Player event handlers
/* ------------------------------------------------------------------------- */
function handleMuteToggle() {
  setIsMuted((prev) => !prev);
}

function handleVolumeChange(e) {
  const value = e.target.value === '' ? 0 : Number(e.target.value);
  setVolume(value === 0 ? 0 : Math.min(1, Math.max(0, value)));
  setIsMuted(value === 0);
}

function reloadStream() {
  dispatch({ type: 'sync', keys: [...new Set(servers.map((s) => s.key)]) });
}

function toggleFullscreen() {
  const video = videoRef.current;
  if (!video) return;
  if (video.requestFullscreen) {
    video.requestFullscreen();
  } else if (video.webkitRequestFullscreen) {
    video.webkitRequestFullscreen();
  }
}