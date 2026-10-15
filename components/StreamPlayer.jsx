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
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Clock,
  Cpu,
  Maximize,
  Pause,
  PictureInPicture,
  Play,
  RefreshCw,
  ShieldAlert,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import ServerSelector from '@/components/ServerSelector';
import {
  buildServerList,
  describeFailure,
  failoverReducer,
  initFailoverState,
} from '@/lib/player/servers';

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
/** Within this many seconds of the seekable end counts as watching live. */
const LIVE_EDGE_TOLERANCE_S = 15;

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

/** Shared, memoised hls.js chunk: downloaded once, the first time an HLS server plays. */
let hlsModule = null;

function loadHls() {
  hlsModule ??= import('hls.js')
    .then((mod) => mod.default)
    .catch((err) => {
      // Let the next attempt try the network again instead of caching a rejection.
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
 * DVR Rewind / Fast-Forward:
 *   - "-" button rewinds the video by 1 minute (delta passed via the window eviv:dvr event,
 *     the same channel <LiveMinute> uses).
 *   - "+" button fast-forwards by 1 minute.
 *   - "LIVE" pulsing button jumps back to real-time (seek to seekable.end()).
 *   Status pill: `WATCHING: 66'` vs `LIVE: 75'`.
 *
 * Picture-in-Picture (PiP):
 *   - PiP button shrinks the video into a floating window when the browser supports it.
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
  const frameRef = useRef(null);

  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  // DVR state: playback minute, how far through the seekable window we are, live vs. lagged.
  const [dvrMinute, setDvrMinute] = useState(0);
  const [progressPct, setProgressPct] = useState(100);
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

  // The "switched server" notice disappears on its own.
  useEffect(() => {
    if (!switched) return undefined;
    const id = setTimeout(() => dispatch({ type: 'dismissSwitch' }), SWITCH_NOTICE_MS);
    return () => clearTimeout(id);
  }, [switched]);

  // Latest values for the playback effect, read without restarting playback.
  const readServer = useEffectEvent((key) => servers.find((s) => s.key === key) ?? null);
  const readAudio = useEffectEvent(() => ({ volume, muted: isMuted }));
  const onAutoplayMuted = useEffectEvent(() => {
    setIsMuted(true);
    setAutoMuted(true);
  });

  // Keep the element in step with the volume/mute controls after the source is attached.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    if (!isMuted) video.volume = volume;
  }, [isMuted, volume]);

  // DVR / rewind controls, shared with <LiveMinute> through window events.
  useEffect(() => {
    const onDvr = (e) => {
      const video = videoRef.current;
      if (!video) return;
      const delta = (e?.detail?.deltaMinutes || 0) * 60;
      try {
        const seekable = video.seekable;
        const end = seekable?.length ? seekable.end(seekable.length - 1) : Number.POSITIVE_INFINITY;
        const newTime = Math.max(0, Math.min((video.currentTime || 0) + delta, end));
        video.currentTime = newTime;
        // Update the displayed minute when seeking
        setDvrMinute(Math.floor(newTime / 60));
        setIsWatchingLive(end - newTime < LIVE_EDGE_TOLERANCE_S);
      } catch {
        /* this stream does not allow seeking */
      }
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
      } catch {
        /* this stream does not allow seeking */
      }
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
    if (!server) return undefined;

    const isEmbed = server.kind === 'embed';
    const video = videoRef.current;
    const frame = frameRef.current;
    // The media element for this kind mounts in the same commit as this effect.
    if (isEmbed ? !frame : !video) return undefined;

    let disposed = false;
    let ready = false;
    let failureSent = false;
    let recoveries = 0;
    let hls = null;
    const stops = [];
    const listeners = [];

    const stopAll = () => {
      while (stops.length) stops.pop()();
      for (const [target, event, handler] of listeners) target.removeEventListener(event, handler);
      listeners.length = 0;
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };

    const fail = (reason) => {
      if (disposed || failureSent) return;
      failureSent = true;
      stopAll();
      dispatch({ type: 'fail', attempt, reason });
    };

    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      listeners.push([target, event, handler]);
    };

    if (!isEmbed) {
      const audio = readAudio();
      video.muted = audio.muted;
      video.volume = audio.volume;
    }

    // No first frame within this long → the server is dead.
    const stopConnectWatchdog = startVisibleTimer(
      isEmbed ? EMBED_TIMEOUT_MS : CONNECT_TIMEOUT_MS,
      () => fail('timeout')
    );
    stops.push(stopConnectWatchdog);

    const markReady = () => {
      if (disposed || ready) return;
      ready = true;
      stopConnectWatchdog();
      dispatch({ type: 'ready', attempt });
      // Played long enough without trouble → servers that failed earlier get another chance.
      stops.push(startVisibleTimer(STABLE_PLAYBACK_MS, () => dispatch({ type: 'stable', attempt })));
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

    // Native HLS (Safari) and plain media files: let the element do the work.
    const startNative = () => {
      video.src = server.url || streamUrl;
      video.load();
      autoplay();
    };

    if (isEmbed) {
      listen(frame, 'load', markReady);
    } else {
      listen(video, 'loadeddata', markReady);
      listen(video, 'playing', () => {
        setPlayingAttempt(attempt);
        setBufferingAttempt(0);
      });
      listen(video, 'waiting', () => setBufferingAttempt(attempt));
      listen(video, 'pause', () => {
        setPlayingAttempt(0);
        setBufferingAttempt(0);
      });
      listen(video, 'timeupdate', () => {
        const current = video.currentTime || 0;
        setDvrMinute(Math.floor(current / 60));
        const seekable = video.seekable;
        if (seekable?.length) {
          const start = seekable.start(0);
          const end = seekable.end(seekable.length - 1);
          const span = end - start;
          // A window longer than a minute means the stream is rewindable (DVR).
          setDvrEnabled(span > 60);
          setProgressPct(span > 0 ? Math.min(100, Math.max(0, ((current - start) / span) * 100)) : 100);
          setIsWatchingLive(end - current < LIVE_EDGE_TOLERANCE_S);
        } else if (Number.isFinite(video.duration) && video.duration > 0) {
          setDvrEnabled(true);
          setProgressPct(Math.min(100, (current / video.duration) * 100));
          setIsWatchingLive(true);
        } else {
          // Straight-to-live stream with no seekable window: the bar stays full.
          setDvrEnabled(false);
          setProgressPct(100);
          setIsWatchingLive(true);
        }
      });
      listen(video, 'error', () => {
        if (hls) return; // hls.js reports its own, more precise errors
        fail('network');
      });

      // Playing but the clock has not moved for a while → treat the server as dead.
      let lastTime = -1;
      let stalledMs = 0;
      const ticker = setInterval(() => {
        if (disposed || !ready || document.hidden) return;
        if (video.paused || video.seeking) {
          lastTime = video.currentTime;
          stalledMs = 0;
          return;
        }
        if (video.currentTime === lastTime) {
          stalledMs += 1000;
          if (stalledMs >= STALL_TIMEOUT_MS) fail('stalled');
        } else {
          stalledMs = 0;
          lastTime = video.currentTime;
        }
      }, 1000);
      stops.push(() => clearInterval(ticker));

      if (kind === 'hls') {
        loadHls()
          .then((Hls) => {
            if (disposed || failureSent) return;
            if (Hls?.isSupported()) {
              hls = new Hls(HLS_CONFIG);
              hls.attachMedia(video);
              hls.loadSource(server.url || streamUrl);
              hls.on(Hls.Events.MEDIA_ATTACHED, autoplay);
              hls.on(Hls.Events.MANIFEST_PARSED, markReady);
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (disposed || !data?.fatal) return;
                const reason = hlsFailureReason(Hls, data);
                if (reason === 'media' && recoveries < MAX_MEDIA_RECOVERIES) {
                  // Media error — try a recovery before giving up on this server.
                  recoveries += 1;
                  hls.startLoad();
                  return;
                }
                fail(reason);
              });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              startNative();
            } else {
              fail('unsupported');
            }
          })
          .catch(() => {
            // The hls.js chunk itself could not be fetched.
            if (!disposed) fail('network');
          });
      } else {
        startNative();
      }
    }

    return () => {
      disposed = true;
      stopAll();
      if (!isEmbed && video) {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [isHydrated, isUpcoming, activeKey, attempt, kind, streamUrl]);

  /* ------------------------------------------------------------------------ */
  /*  DVR Rewind / Fast-Forward handlers (same window events as <LiveMinute>) */
  /* ------------------------------------------------------------------------ */
  const seekByMinutes = (deltaMinutes) => {
    window.dispatchEvent(new CustomEvent('eviv:dvr', { detail: { deltaMinutes } }));
  };

  const handleDvrRewind = () => seekByMinutes(-1);
  const handleDvrForward = () => seekByMinutes(1);
  const handleGoLive = () => window.dispatchEvent(new CustomEvent('eviv:dvr-live'));

  /* ------------------------------------------------------------------------ */
  /*  Picture-in-Picture (PiP) toggle                                         */
  /* ------------------------------------------------------------------------ */
  const handlePiPToggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture?.().catch(() => {});
      return;
    }
    video.requestPictureInPicture?.().catch((err) => {
      console.warn('Picture-in-Picture failed:', err);
    });
  };

  // Read after hydration only: the server render has no `document`.
  const pipSupported = isHydrated && typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);

  /* ------------------------------------------------------------------------ */
  /*  Transport, audio and layout controls                                    */
  /* ------------------------------------------------------------------------ */
  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play()?.catch(() => {});
    else video.pause();
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
    setAutoMuted(false);
  };

  const handleVolumeChange = (e) => {
    const value = e.target.value === '' ? 0 : Number(e.target.value);
    setVolume(value === 0 ? 0 : Math.min(1, Math.max(0, value)));
    setIsMuted(value === 0);
    setAutoMuted(false);
  };

  const toggleFullscreen = () => {
    const root = playerRef.current;
    if (!root) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      document.exitFullscreen?.() ?? document.webkitExitFullscreen?.();
      return;
    }
    if (root.requestFullscreen) root.requestFullscreen();
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  };

  /** Restart the active server. */
  const reloadStream = () => dispatch({ type: 'reload' });

  /** Forget every failure, start again from Server 1 and re-sign fresh links. */
  const retryAllServers = () => {
    dispatch({ type: 'retryAll' });
    startRefresh(() => router.refresh());
  };

  /* ------------------------------------------------------------------------ */
  /*  Server status helper                                                    */
  /* ------------------------------------------------------------------------ */
  const statusOf = (server) => {
    if (server.key === activeKey) {
      if (phase === 'ready') return 'playing';
      if (phase === 'connecting') return 'connecting';
      return 'failed';
    }
    return failed[server.key] ? 'failed' : 'idle';
  };

  const selectServer = (server) => dispatch({ type: 'select', index: server.index });

  const toggleAutoSwitch = () => {
    const enabled = !autoSwitch;
    dispatch({ type: 'setAutoSwitch', enabled });
    try {
      localStorage.setItem(AUTO_SWITCH_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  Announcements for failures and automatic switches                       */
  /* ------------------------------------------------------------------------ */
  const announcement = useMemo(() => {
    if (switched) {
      return `Switched to ${activeServer?.label || 'another server'} · previous server was unavailable`;
    }
    if (phase === 'exhausted') return 'All servers unavailable';
    if (phase === 'failed') return describeFailure(activeKey ? failed[activeKey] : null);
    return '';
  }, [switched, phase, activeServer, activeKey, failed]);

  /* ------------------------------------------------------------------------ */
  /*  Server list for the selector (marks the one currently playing)          */
  /* ------------------------------------------------------------------------ */
  const serversEnriched = useMemo(
    () =>
      servers.map((s) => ({
        ...s,
        label: s.key === activeKey ? `${s.label} ●` : s.label,
      })),
    [servers, activeKey]
  );

  const isDown = phase === 'failed' || phase === 'exhausted';
  const statusLabel = isWatchingLive ? `LIVE: ${dvrMinute}'` : `WATCHING: ${dvrMinute}'`;

  /* ------------------------------------------------------------------------- */
  /*  Render                                                                    */
  /* ------------------------------------------------------------------------- */
  return (
    <div ref={playerRef} className="group relative rounded-2xl overflow-hidden shadow-2xl">
      {/* Video element */}
      {isUpcoming ? (
        <div className="p-8 text-center text-zinc-400">
          <Clock className="h-12 w-12 mx-auto mb-2" />
          <p className="font-medium">Upcoming match</p>
          <p className="text-sm">{matchTitle || ''}</p>
        </div>
      ) : isVideo && isHydrated && activeKey ? (
        <video
          ref={videoRef}
          playsInline
          muted={isMuted}
          className={`w-full h-[350px] object-cover bg-black ${isTheaterMode ? 'lg:h-[70vh]' : ''}`}
        />
      ) : kind === 'embed' && isHydrated && activeServer ? (
        <iframe
          ref={frameRef}
          src={activeServer.url}
          title={matchTitle || 'Embedded player'}
          className="aspect-video w-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        />
      ) : (
        <div className="p-8 text-center text-zinc-400">
          <span className="text-lime-500">No stream available</span>
        </div>
      )}

      {/* Failure overlay: one server down, or every server exhausted */}
      {isHydrated && !isUpcoming && isDown && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-navy-950/92 p-6 text-center backdrop-blur-sm">
          <ShieldAlert className="h-8 w-8 text-red-400" aria-hidden="true" />
          <p className="text-sm font-bold text-zinc-100">
            {phase === 'exhausted' ? 'All servers unavailable' : 'This server is unavailable'}
          </p>
          <p className="max-w-sm text-xs text-zinc-400">
            {activeKey ? describeFailure(failed[activeKey]) : 'No stream resolved for this match yet.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={reloadStream}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/40 bg-lime-500/10 px-3 py-1.5 text-[10px] font-bold text-lime-400 transition-all hover:bg-lime-500/20 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Retry
            </button>
            {hasMultiple && phase === 'failed' && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'next' })}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300/40 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-zinc-300 transition-all hover:bg-white/10 active:scale-95"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Try next server
              </button>
            )}
            <button
              type="button"
              onClick={retryAllServers}
              disabled={isRefreshing}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300/40 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-zinc-300 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-60"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {isRefreshing ? 'Re-signing links…' : 'Retry all'}
            </button>
          </div>
        </div>
      )}

      {/* Automatic switch notice */}
      {switched && (
        <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime-500/30 bg-navy-900/95 px-3 py-1.5 text-[10px] font-bold text-lime-300 shadow-lg">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {`Switched to ${serversEnriched[switched.to]?.label || 'another server'} · ${describeFailure(switched.reason)}`}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'dismissSwitch' })}
            className="cursor-pointer rounded px-1 text-zinc-400 transition-colors hover:text-zinc-100"
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* Custom controls overlay */}
      {isVideo && isHydrated && activeKey && !isDown && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2.5 bg-gradient-to-t from-black/95 via-black/40 to-transparent p-4 transition-opacity duration-300 ${isPlaying ? 'opacity-0 focus-within:opacity-100 group-hover:opacity-100' : 'opacity-100'}`}
        >
          {/* Live timeline indicator */}
          <div className="flex items-center gap-3">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime-500 to-lime-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-lime-500 dark:text-lime-400">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
              {isBuffering ? 'Buffering' : isWatchingLive ? 'Live' : 'Watching'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            {/* Transport + DVR controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlayPause}
                className="cursor-pointer rounded-md border border-white/15 bg-white/10 p-2 text-white transition-all hover:bg-white/20 active:scale-90"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleDvrRewind}
                disabled={!dvrEnabled}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40${
                  dvrEnabled ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
                }`}
                title="Rewind 1 minute"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>{'-1'}</span>
              </button>
              <button
                type="button"
                onClick={handleDvrForward}
                disabled={!dvrEnabled}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40${
                  dvrEnabled ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
                }`}
                title="Fast-forward 1 minute"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>{'+1'}</span>
              </button>
              <button
                type="button"
                onClick={handleGoLive}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90${
                  isWatchingLive ? ' border-lime-500/40 bg-lime-600/10 text-lime-400' : ''
                }`}
                title="Jump to live"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-lime-500" />
                LIVE
              </button>
            </div>

            {/* PiP button */}
            {pipSupported && (
              <button
                type="button"
                onClick={handlePiPToggle}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-lime-500/30 bg-lime-500/10 p-2 text-[10px] font-bold text-lime-400 transition-all hover:bg-lime-500/20 hover:text-lime-300 active:scale-90"
                title="Picture in Picture"
              >
                <PictureInPicture className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Volume control */}
            <div className="group/volume flex items-center gap-2">
              {autoMuted && isMuted && (
                <button
                  type="button"
                  onClick={handleMuteToggle}
                  className="cursor-pointer rounded-md border border-lime-500/40 bg-lime-500/15 px-2 py-1 text-[10px] font-bold text-lime-300 transition-colors hover:bg-lime-500/25"
                >
                  Tap to unmute
                </button>
              )}
              <button
                type="button"
                onClick={handleMuteToggle}
                className="cursor-pointer rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 active:scale-90"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-zinc-350" />
                ) : volume < 0.4 ? (
                  <Volume1 className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
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
                <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
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
            <RefreshCw className={`h-3.5 w-3.5 ${isBuffering ? 'animate-spin' : ''}`} />
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
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-navy-800/80 border border-lime-500/30 px-4 py-1.5 text-xs font-bold text-lime-400 dark:text-lime-300 transition-colors">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500 mr-1" />
          {statusLabel}
        </div>
      )}
    </div>
  );
}
