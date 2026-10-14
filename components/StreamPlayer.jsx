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
  Shield,
  ShieldAlert,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import ServerSelector, { ServerMenu } from '@/components/ServerSelector';
import {
  buildServerList,
  describeFailure,
  failoverReducer,
  initFailoverState,
  joinLabels,
  pickNextServer,
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
const AUTO_SWITCH_STORAGE_KEY = 'footylive:auto-switch';

const HLS_CONFIG = {
  maxBufferLength: 20,
  maxBufferSize: 20 * 1024 * 1024,
  // Keeps memory bounded over a 90+ minute match.
  backBufferLength: 30,
  // Live latency uses hls.js' default of 3 target durations. A fixed 3 s sits closer to the
  // live edge than a single segment of most sports streams and makes them rebuffer constantly.
  //
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

let hlsModule = null;
/** hls.js is code-split and downloaded once, the first time an HLS server plays. */
function loadHls() {
  hlsModule ??= import('hls.js')
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

/**
 * Stream player with a server selector and automatic failover.
 *
 * Every source the page resolved becomes a server ("Server 1", "Server 2", …, "Backup").
 * When the active server fails — fatal hls.js error, media error that survives recovery,
 * no first frame, a long stall, or an embed that never loads — the player moves on to the
 * next server that has not been tried yet, and shows "all servers unavailable" with a
 * retry once every server has failed instead of spinning forever.
 */
export default function StreamPlayer({ streamUrl, channels, matchTitle, matchStatus }) {
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
  const [sandboxShield, setSandboxShield] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const playerRef = useRef(null);
  const videoRef = useRef(null);

  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const retryAfterRefresh = useRef(false);

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
      const code = video.error?.code;
      if (!code || code === 1) return; // MEDIA_ERR_ABORTED: we changed the source ourselves
      fail(code === 3 ? 'media' : 'network'); // decode error vs. network / unreachable source
    });

    // One ticker drives three watchdogs: connect timeout, stall detection, stable playback.
    let waitedMs = 0;
    let stalledMs = 0;
    let playedMs = 0;
    let lastTime = -1;
    let stableSent = false;
    ticker = setInterval(() => {
      if (disposed || settled || document.hidden) return;
      if (!loaded) {
        waitedMs += 1000;
        if (waitedMs >= CONNECT_TIMEOUT_MS) fail('timeout');
        return;
      }
      if (video.paused || video.ended) {
        stalledMs = 0;
        lastTime = video.currentTime;
        return;
      }
      if (video.currentTime !== lastTime) {
        if (lastTime >= 0) playedMs += 1000;
        lastTime = video.currentTime;
        stalledMs = 0;
        if (!stableSent && playedMs >= STABLE_PLAYBACK_MS) {
          stableSent = true;
          dispatch({ type: 'stable', attempt });
        }
        return;
      }
      stalledMs += 1000;
      if (stalledMs >= STALL_TIMEOUT_MS && readAutoSwitch()) fail('stalled');
    }, 1000);

    const audio = readAudio();
    video.volume = audio.volume;
    video.muted = audio.muted;

    const playNatively = () => {
      video.src = server.url;
      autoplay();
    };

    if (server.kind === 'mp4') {
      playNatively();
    } else {
      loadHls()
        .then((Hls) => {
          if (disposed || settled) return;
          // Prefer hls.js wherever MSE exists (Chrome now *claims* native HLS too): it reports
          // precise, recoverable errors. Native playback remains the fallback for iOS Safari.
          if (Hls.isSupported()) {
            let mediaRecoveries = 0;
            hls = new Hls(HLS_CONFIG);
            // The server answered: give a slow network a full window for the first segment.
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              waitedMs = 0;
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (!data?.fatal || disposed || settled) return;
              const recoverable =
                data.type === Hls.ErrorTypes.MEDIA_ERROR &&
                data.details !== Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR;
              if (recoverable && mediaRecoveries < MAX_MEDIA_RECOVERIES) {
                mediaRecoveries += 1;
                if (mediaRecoveries > 1) hls.swapAudioCodec();
                hls.recoverMediaError();
                return;
              }
              // Fatal network errors arrive only after hls.js exhausted its own retries.
              fail(hlsFailureReason(Hls, data));
            });
            hls.loadSource(server.url);
            hls.attachMedia(video);
            autoplay();
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            playNatively();
          } else {
            fail('unsupported');
          }
        })
        .catch(() => {
          // The hls.js chunk could not be downloaded: native HLS may still work.
          if (disposed || settled) return;
          if (video.canPlayType('application/vnd.apple.mpegurl')) playNatively();
          else fail('network');
        });
    }

    return () => {
      disposed = true;
      teardown();
    };
  }, [attempt, activeKey, isUpcoming, isHydrated]);

  // Embedded players cannot report errors to us; one that never loads counts as failed.
  useEffect(() => {
    if (!isHydrated || isUpcoming || kind !== 'embed' || phase !== 'connecting') return undefined;
    return startVisibleTimer(EMBED_TIMEOUT_MS, () => dispatch({ type: 'fail', attempt, reason: 'timeout' }));
  }, [attempt, kind, phase, isUpcoming, isHydrated]);

  // The "switched to …" notice fades once the new server has been playing for a moment.
  useEffect(() => {
    if (!switched || phase !== 'ready') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'dismissSwitch' }), SWITCH_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [switched, phase]);

  /* ------------------------------------------------------------------------ */
  /*  Actions                                                                  */
  /* ------------------------------------------------------------------------ */
  const selectServer = (server) => dispatch({ type: 'select', index: state.keys.indexOf(server.key) });
  const reloadStream = () => dispatch({ type: 'reload' });
  const tryNextServer = () => dispatch({ type: 'next' });

  // "Retry all" first re-fetches the page data, so expired or rotated stream links come back
  // freshly signed (and newly published servers appear), then restarts from Server 1.
  const retryAll = () => {
    retryAfterRefresh.current = true;
    startRefresh(() => router.refresh());
  };
  useEffect(() => {
    if (isRefreshing || !retryAfterRefresh.current) return;
    retryAfterRefresh.current = false;
    dispatch({ type: 'retryAll' });
  }, [isRefreshing]);

  // Everything failed while the connection was down: start over once it is back.
  const onBackOnline = useEffectEvent(() => retryAll());
  useEffect(() => {
    if (phase !== 'exhausted') return undefined;
    const handler = () => onBackOnline();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [phase]);

  const handleEmbedLoad = (event) => {
    let doc = null;
    try {
      doc = event.currentTarget.contentDocument;
    } catch {
      /* cross-origin: the provider's embed page loaded */
    }
    // Still same-origin on our redirect route means it answered with an error (e.g. an expired
    // link) instead of redirecting to the provider.
    if (doc?.location?.pathname === '/api/stream-redirect') dispatch({ type: 'fail', attempt, reason: 'network' });
    else dispatch({ type: 'ready', attempt });
  };

  const toggleAutoSwitch = () => {
    const enabled = !autoSwitch;
    dispatch({ type: 'setAutoSwitch', enabled });
    try {
      localStorage.setItem(AUTO_SWITCH_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
  };

  const toggleShield = () => {
    setSandboxShield((on) => !on);
    if (kind === 'embed') dispatch({ type: 'reload' }); // the embed reloads under the new sandbox
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play()?.catch(() => {});
    else video.pause();
  };

  const handleMuteToggle = () => {
    const video = videoRef.current;
    const muted = !isMuted;
    const level = !muted && volume === 0 ? 0.8 : volume;
    setIsMuted(muted);
    setAutoMuted(false);
    setVolume(level);
    if (video) {
      video.muted = muted;
      video.volume = level;
    }
  };

  const handleUnmute = () => {
    const video = videoRef.current;
    const level = volume > 0 ? volume : 0.8;
    setIsMuted(false);
    setAutoMuted(false);
    setVolume(level);
    if (video) {
      video.muted = false;
      video.volume = level;
      if (video.paused) video.play()?.catch(() => {});
    }
  };

  const handleVolumeChange = (e) => {
    const level = parseFloat(e.target.value);
    setVolume(level);
    setIsMuted(level === 0);
    setAutoMuted(false);
    const video = videoRef.current;
    if (video) {
      video.volume = level;
      video.muted = level === 0;
    }
  };

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) {
      playerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  Derived view state                                                       */
  /* ------------------------------------------------------------------------ */
  const serverAt = (stateIndex) => servers.find((s) => s.key === state.keys[stateIndex]) ?? null;

  const statusOf = (server) => {
    if (server.key === activeKey) {
      if (phase === 'connecting') return 'connecting';
      if (phase === 'ready') return 'playing';
      return 'failed';
    }
    return failed[server.key] ? 'failed' : 'idle';
  };

  const isActivePhase = !isUpcoming && !!activeServer && (phase === 'connecting' || phase === 'ready');
  const showMedia = isHydrated && isActivePhase;
  const failureReason = activeKey ? failed[activeKey] : null;
  const switchedFrom = switched ? serverAt(switched.from) : null;
  const nextIndex = hasMultiple ? pickNextServer(state.keys, active, state.tried, failed) : -1;
  const nextServer = hasMultiple ? serverAt(nextIndex !== -1 ? nextIndex : (active + 1) % state.keys.length) : null;

  let announcement = '';
  if (!isUpcoming && activeServer) {
    if (phase === 'exhausted') announcement = hasMultiple ? 'All servers failed.' : 'Stream unavailable.';
    else if (phase === 'failed') announcement = `${activeServer.label} failed.`;
    else if (switchedFrom) announcement = `${switchedFrom.label} failed. Switched to ${activeServer.label}.`;
  }

  if (servers.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#050508] px-6 text-center" style={{ aspectRatio: '16/9' }}>
        <AlertCircle className="mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm font-bold text-white">No stream sources available</p>
        <p className="mt-1 text-xs text-zinc-500">Check back closer to kickoff.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Player window container */}
      <div
        ref={playerRef}
        className={`group relative overflow-hidden bg-black shadow-2xl transition-all duration-500 ease-out ${
          isTheaterMode
            ? 'relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-[45vh] w-screen rounded-none border-y border-zinc-800 sm:h-[55vh] md:h-[65vh] lg:h-[70vh] xl:h-[75vh]'
            : 'w-full rounded-2xl border border-zinc-800'
        }`}
        style={isTheaterMode ? undefined : { aspectRatio: '16/9' }}
      >
        {/* Media layer: one fresh element per attempt */}
        {showMedia &&
          (isVideo ? (
            <video
              key={attempt}
              ref={videoRef}
              className="absolute inset-0 h-full w-full cursor-pointer bg-black object-contain"
              playsInline
              onClick={handlePlayPause}
              onPlay={() => setPlayingAttempt(attempt)}
              onPause={() => setPlayingAttempt(0)}
              onWaiting={() => setBufferingAttempt(attempt)}
              onPlaying={() => setBufferingAttempt(0)}
            />
          ) : (
            <iframe
              key={`${attempt}-${sandboxShield ? 'shield' : 'compat'}`}
              src={activeServer.url}
              title={`${matchTitle} — ${activeServer.label}`}
              className="absolute inset-0 h-full w-full"
              allowFullScreen
              allow="autoplay; fullscreen"
              onLoad={handleEmbedLoad}
              sandbox={sandboxShield ? 'allow-scripts allow-same-origin allow-forms allow-presentation' : undefined}
            />
          ))}

        {/* Connecting screen (also explains an automatic switch); server-rendered too */}
        {isActivePhase && phase === 'connecting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050508] px-6 text-center">
            <div className="relative flex items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500" />
              <Cpu className="absolute h-5 w-5 animate-pulse text-violet-400" />
            </div>
            <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
              Connecting to {activeServer.label}…
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {isVideo ? 'Initializing native HLS player' : 'Loading embedded player'}
              {switchedFrom && hasMultiple ? ` · attempt ${state.tried.length} of ${servers.length}` : ''}
            </p>
            {switchedFrom && (
              <p className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {switchedFrom.label} failed ({describeFailure(switched.reason).toLowerCase()}) — switched automatically
                </span>
              </p>
            )}
          </div>
        )}

        {/* Mid-playback buffering */}
        {showMedia && isVideo && phase === 'ready' && isPlaying && isBuffering && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
          </div>
        )}

        {/* Server failed and auto-switch is off */}
        {!isUpcoming && phase === 'failed' && activeServer && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#050508]/95 px-6 text-center">
            <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-sm font-bold text-white">{activeServer.label} couldn&apos;t play this stream</p>
            <p className="mt-1.5 max-w-sm text-xs text-zinc-500">
              {describeFailure(failureReason)}. Auto-switch is off{hasMultiple ? ' — pick another server.' : '.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {nextServer && (
                <button
                  type="button"
                  onClick={tryNextServer}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/20 transition-colors hover:bg-violet-500"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Try {nextServer.label}
                </button>
              )}
              <button
                type="button"
                onClick={reloadStream}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-850 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-300 transition-colors hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry {activeServer.label}
              </button>
            </div>
          </div>
        )}

        {/* Every server failed */}
        {!isUpcoming && phase === 'exhausted' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#050508]/95 px-6 text-center">
            <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <p className="text-sm font-bold text-white">{hasMultiple ? 'All servers are unavailable' : 'Stream unavailable'}</p>
            <p className="mt-1.5 max-w-sm text-xs text-zinc-500">
              {hasMultiple
                ? `Tried ${joinLabels(servers.map((s) => s.label))}. `
                : `${describeFailure(failureReason)}. `}
              Streams often come back within a few minutes.
            </p>
            <button
              type="button"
              onClick={retryAll}
              className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/20 transition-colors hover:bg-violet-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {hasMultiple ? 'Retry all servers' : 'Retry'}
            </button>
          </div>
        )}

        {/* Paused: big play button (delayed fade so autoplay doesn't flash it) */}
        {showMedia && isVideo && phase === 'ready' && !isPlaying && (
          <div
            onClick={handlePlayPause}
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1.5px] animate-fade-in"
            style={{ animationDelay: '250ms' }}
          >
            <div className="flex h-16 w-16 scale-100 transform items-center justify-center rounded-full border border-violet-400/20 bg-violet-600/90 text-white shadow-[0_0_30px_rgba(124,58,237,0.6)] transition-all duration-300 hover:scale-110 active:scale-95">
              <Play className="ml-1 h-7 w-7 fill-white" />
            </div>
          </div>
        )}

        {/* Upcoming: nothing is loaded until kickoff */}
        {isUpcoming && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
            <ShieldAlert className="mb-3 h-10 w-10 text-violet-400" />
            <p className="text-sm font-bold text-white">Fixture Has Not Started Yet</p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              Live streams will be generated by our provider strategy registry close to kickoff.
            </p>
          </div>
        )}

        {/* Title + live badge (top left) */}
        <div
          className={`pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 ${
            hasMultiple && !isUpcoming ? 'max-w-[calc(100%-9.5rem)]' : 'max-w-[calc(100%-1.5rem)]'
          }`}
        >
          <span className="truncate rounded-full border border-zinc-800/80 bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
            {matchTitle}
          </span>
          {phase === 'ready' && matchStatus === 'live' && (
            <span className="flex shrink-0 animate-pulse items-center gap-1.5 rounded-full border border-red-500/30 bg-red-600/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="hidden sm:inline">Live Stream</span>
              <span className="sm:hidden">Live</span>
            </span>
          )}
        </div>

        {/* Server menu (top right) — reachable in fullscreen and theater mode */}
        {hasMultiple && !isUpcoming && (
          <ServerMenu servers={servers} activeKey={activeKey} statusOf={statusOf} failed={failed} onSelect={selectServer} />
        )}

        {/* Notices: automatic switch, muted autoplay */}
        <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex flex-col items-center gap-2 px-3">
          {phase === 'ready' && switchedFrom && (
            <div className="inline-flex max-w-full animate-fade-in items-center gap-2 rounded-full border border-violet-500/30 bg-black/85 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-2xl backdrop-blur-md">
              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-violet-400" />
              <span className="truncate">
                Switched to {activeServer.label} · {switchedFrom.label} was unavailable
              </span>
            </div>
          )}
          {showMedia && isVideo && phase === 'ready' && autoMuted && isPlaying && (
            <button
              type="button"
              onClick={handleUnmute}
              className="pointer-events-auto inline-flex animate-fade-in cursor-pointer items-center gap-2 rounded-full border border-zinc-700 bg-black/85 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-2xl backdrop-blur-md transition-colors hover:border-violet-500/50"
            >
              <VolumeX className="h-3.5 w-3.5 text-zinc-300" />
              Tap to unmute
            </button>
          )}
        </div>

        {/* Custom controls (native video only) */}
        {showMedia && isVideo && phase === 'ready' && (
          <div
            className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2.5 bg-gradient-to-t from-black/95 via-black/40 to-transparent p-4 transition-opacity duration-300 ${
              isPlaying ? 'opacity-0 focus-within:opacity-100 group-hover:opacity-100' : 'opacity-100'
            }`}
          >
            {/* Live timeline indicator */}
            <div className="flex items-center gap-3">
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
                <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600" />
              </div>
              <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-red-500">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-red-500" />
                Live
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={handlePlayPause}
                  className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 active:scale-90"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
                </button>

                <div className="group/volume flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className="rounded-lg bg-white/10 p-2 text-white transition-all hover:bg-white/20 active:scale-90"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4 text-zinc-450" />
                    ) : volume < 0.4 ? (
                      <Volume1 className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
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
                    className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500 outline-none transition-all duration-300 focus:w-20 group-hover/volume:w-20"
                  />
                </div>

                <span className="hidden items-center gap-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-violet-400 sm:inline-flex">
                  Native Player (Ad-Free)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reloadStream}
                  className="rounded-lg bg-white/10 p-2 text-zinc-200 transition-all hover:bg-white/20 hover:text-white active:scale-90"
                  title="Reload Server Connection"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-lg bg-white/10 p-2 text-zinc-200 transition-all hover:bg-white/20 hover:text-white active:scale-90"
                  title="Toggle Fullscreen"
                >
                  <Maximize className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Server selector: only when there is something to choose between */}
      {hasMultiple && !isUpcoming && (
        <ServerSelector
          servers={servers}
          activeKey={activeKey}
          statusOf={statusOf}
          failed={failed}
          autoSwitch={autoSwitch}
          onSelect={selectServer}
          onToggleAutoSwitch={toggleAutoSwitch}
        />
      )}

      {/* Ad-Shield explainer */}
      {kind === 'embed' && sandboxShield && (
        <div className="animate-fade-in space-y-2.5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-relaxed text-zinc-650 shadow-sm dark:border-violet-500/20 dark:bg-violet-950/15 dark:text-zinc-400">
          <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-400">
            <Shield className="h-4 w-4 text-violet-600 dark:text-violet-500" />
            <span>Ad-Shield Active (Intrusive Ad & Popup Blocker)</span>
          </div>
          <p className="text-[11.5px] leading-normal text-zinc-600 dark:text-zinc-400">
            <strong>What this does:</strong> The stream is loaded inside a secure sandbox that strictly blocks malicious scripts, auto-downloads, tracking cookies, and aggressive popup advertisement redirects.
          </p>
          <p className="text-[11.5px] leading-normal text-zinc-600 dark:text-zinc-400">
            <strong>What could happen:</strong> Some external stream hosts detect sandboxing and will block playback with an <strong>&quot;Embed Blocked&quot;</strong> or black screen.
          </p>
          <p className="text-[11.5px] leading-normal text-zinc-600 dark:text-zinc-400">
            <strong>Why it happens:</strong> These third-party stream hosts make revenue through aggressive ad redirects. They block sandboxed players to force you to view their popups. Turn Ad-Shield <strong>OFF</strong> below if the stream refuses to load.
          </p>
        </div>
      )}

      {/* Action toolbar (Ad-Shield / native status, Refresh, Theater, Fullscreen) */}
      <div className="glass-panel flex flex-col justify-between gap-4 rounded-xl p-4 shadow-md lg:flex-row lg:items-center">
        {kind === 'embed' ? (
          <div className="flex w-full items-center gap-3 rounded-lg border border-zinc-300/40 bg-zinc-200/60 p-2.5 shadow-inner dark:border-zinc-900/60 dark:bg-zinc-950/60 lg:w-auto">
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${sandboxShield ? 'bg-green-500' : 'animate-pulse bg-red-400'}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Ad-Shield {sandboxShield ? 'ON' : 'OFF'}
                </span>
              </div>
              <span className="mt-0.5 block text-[9px] leading-none text-zinc-500 dark:text-zinc-500">
                {sandboxShield ? 'Blocking redirects & popups' : '⚠ Protection disabled'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sandboxShield}
              aria-label="Ad-Shield"
              onClick={toggleShield}
              className={`relative ml-auto inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none lg:ml-2 ${
                sandboxShield ? 'bg-green-600' : 'bg-zinc-300 dark:bg-zinc-800'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  sandboxShield ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-300/40 bg-zinc-200/40 p-2.5 text-left shadow-inner dark:border-zinc-900/60 dark:bg-zinc-950/40 lg:w-auto">
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                Native Player Active
              </span>
              <span className="mt-0.5 block text-[10px] leading-none text-zinc-500 dark:text-zinc-500">
                Direct HLS decoder runs inside native media sandbox.
              </span>
            </div>
          </div>
        )}

        <div className="flex w-full items-center justify-end gap-2 rounded-lg border border-zinc-300/40 bg-zinc-200/60 p-1.5 shadow-inner dark:border-zinc-900/60 dark:bg-zinc-950/60 lg:w-auto">
          <button
            type="button"
            onClick={reloadStream}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-950 active:scale-95 dark:border-zinc-950 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            title="Reload Stream Connection"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${showMedia && phase === 'connecting' ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTheaterMode((on) => !on)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
              isTheaterMode
                ? 'border-violet-500/45 bg-violet-600/10 text-violet-600 shadow-sm hover:bg-violet-600/20 dark:text-violet-400'
                : 'border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-950 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'
            }`}
            title={isTheaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
          >
            <Cpu className={`h-3.5 w-3.5 ${isTheaterMode ? 'animate-pulse' : ''}`} />
            <span>{isTheaterMode ? 'Normal Mode' : 'Theater'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-950 active:scale-95 dark:border-zinc-950 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
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
    </div>
  );
}
