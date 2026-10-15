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
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import ServerSelector, { ServerMenu } from '@/components/ServerSelector';
import {
  autoRetryDelay,
  buildServerList,
  describeFailure,
  failoverReducer,
  initFailoverState,
  serverKinds,
} from '@/lib/player/servers';
import { loadHls } from '@/lib/player/loadHls';
import { rankStreams } from '@/lib/player/health';
import useStreamHealth from '@/lib/hooks/useStreamHealth';
import {
  EMBED_IFRAME_ALLOW,
  EMBED_REFERRER_POLICY,
  classifyFrameLocation,
  embedCheckUrl,
  readFrameHref,
} from '@/lib/player/embed';

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

/** Initial failover state: server keys plus their stream kinds (embed vs direct). */
function initFromServers(list) {
  return initFailoverState(list.map((s) => s.key), true, serverKinds(list));
}

/** Stream player with a server selector and automatic failover.
 *
 * Every source the page resolved becomes a server ("Server 1", "Server 2", …, "Backup").
 * When the active server fails — fatal hls.js error, media error that survives recovery,
 * no first frame, a long stall, an embed that never loads or whose signed link was
 * refused, or a provider page our server reports as gone — the player moves on to the
 * next server that has not been tried yet (direct HLS/MP4 backups first after an embed
 * fails). Viewers can report a broken provider player with "Next server". Once every
 * server has failed it shows "all servers unavailable" and retries the whole list on its
 * own (10 s → 30 s → 60 s, then it waits for the viewer) instead of spinning forever.
 *
 * Embedded provider players run in an unsandboxed iframe with a permissive `allow` list:
 * providers refuse to play inside `sandbox` ("Remove sandbox attributes on the iframe tag").
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
  compact = false,
  initialMuted = false,
  onRefreshLinks,
}) {
  const isUpcoming = matchStatus === 'upcoming';
  const sourceServers = useMemo(() => buildServerList(channels, streamUrl), [channels, streamUrl]);
  const health = useStreamHealth(sourceServers, !isUpcoming);
  const servers = useMemo(() => {
    const observed = sourceServers.map((server) => ({ ...server, health: health[server.key] }));
    return Object.keys(health).length ? rankStreams(observed) : observed;
  }, [sourceServers, health]);
  const serverKeys = useMemo(() => servers.map((s) => s.key), [servers]);
  const kindsByKey = useMemo(() => serverKinds(servers), [servers]);

  const [state, dispatch] = useReducer(failoverReducer, servers, initFromServers);
  const { active, attempt, phase, failed, autoSwitch, switched } = state;

  // Resolved by key, not index: a refreshed list may reorder servers without interrupting playback.
  const activeKey = state.keys[active] ?? null;
  const activeServer = servers.find((s) => s.key === activeKey) ?? null;
  const kind = activeServer?.kind ?? null;
  const activeUrl = activeServer?.url || '';
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
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [autoMuted, setAutoMuted] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Automatic "retry every server" rounds after the whole list failed.
  const [autoRetryRound, setAutoRetryRound] = useState(0);
  /** Seconds left, tagged with the attempt it belongs to (stale ticks are ignored). */
  const [retryTick, setRetryTick] = useState({ attempt: 0, remaining: 0 });
  /** Attempt whose automatic retry the viewer cancelled. */
  const [retryCancelledAttempt, setRetryCancelledAttempt] = useState(0);

  const stageRef = useRef(null);
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
    dispatch({ type: 'sync', keys: serverKeys, kinds: kindsByKey });
    dispatch({ type: 'health', health, preferredKey: serverKeys[0] });
  }, [serverKeys, kindsByKey, health]);

  // The in-player server menu is offered while the stage is fullscreen.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Auto-switch preference survives reloads (read after mount to keep hydration stable).
  useEffect(() => {
    try {
      if (localStorage.getItem(AUTO_SWITCH_STORAGE_KEY) === 'off') dispatch({ type: 'setAutoSwitch', enabled: false });
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!compact) return undefined;
    const mute = () => { setIsMuted(true); setAutoMuted(false); };
    window.addEventListener('eviv:multiview-mute', mute);
    return () => window.removeEventListener('eviv:multiview-mute', mute);
  }, [compact]);

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
  const onStablePlayback = useEffectEvent((stableAttempt) => {
    dispatch({ type: 'stable', attempt: stableAttempt });
    // Healthy playback again: automatic retries start from the shortest pause next time.
    setAutoRetryRound(0);
  });

  // Keep the element in step with the volume/mute controls after the source is attached.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    if (!isMuted) video.volume = volume;
  }, [isMuted, volume]);

  // Quad-view players must not seek each other through global DVR events.
  useEffect(() => {
    if (compact) return undefined;
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
  }, [compact]);

  /* ------------------------------------------------------------------------ */
  /*  Playback: one run per attempt (hls.js / native HLS / plain media file)  */
  /* ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!isHydrated || isUpcoming || !activeKey) return undefined;
    const server = readServer(activeKey);
    if (!server || !activeUrl) return undefined;

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
    let stopConnectWatchdog = startVisibleTimer(
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
      stops.push(startVisibleTimer(STABLE_PLAYBACK_MS, () => onStablePlayback(attempt)));
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
      video.src = activeUrl;
      video.load();
      autoplay();
    };

    if (isEmbed) {
      // Unsandboxed provider frame: a cross-origin document means the provider page loaded.
      // A readable same-origin `/api/…` document means our signed redirect refused the link
      // (expired / invalid) and the frame is showing its error page instead of a player.
      const inspectFrame = () => {
        const state = classifyFrameLocation(readFrameHref(frame), window.location.origin);
        if (state === 'blank') return; // initial about:blank; the real navigation follows
        if (state === 'refused') fail('embed');
        else markReady();
      };
      listen(frame, 'load', inspectFrame);
      // The frame may already have navigated before this effect ran (fast or cached responses).
      inspectFrame();

      // Server-side probe of the provider page: dead links (404/410, unknown host) fail over
      // right away instead of leaving a provider error on screen. Blocks never fail a server.
      const checkUrl = embedCheckUrl(server.url);
      if (checkUrl) {
        const controller = new AbortController();
        stops.push(() => controller.abort());
        fetch(checkUrl, { cache: 'no-store', signal: controller.signal })
          .then((response) => (response.ok ? response.json() : null))
          .then((result) => {
            if (result?.health === 'offline') fail('network');
          })
          .catch(() => {
            /* probe unavailable: rely on the frame itself */
          });
      }
    } else {
      listen(video, 'loadeddata', markReady);
      listen(video, 'playing', () => {
        markReady();
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
              hls.loadSource(activeUrl);
              hls.on(Hls.Events.MEDIA_ATTACHED, autoplay);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // A manifest is not a frame: dead segment URLs must still trip
                // the no-first-frame watchdog and trigger automatic failover.
                if (disposed || ready) return;
                stopConnectWatchdog();
                stopConnectWatchdog = startVisibleTimer(CONNECT_TIMEOUT_MS, () => fail('timeout'));
                stops.push(stopConnectWatchdog);
                autoplay();
              });
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (disposed || !data?.fatal) return;
                const reason = hlsFailureReason(Hls, data);
                if (reason === 'media' && recoveries < MAX_MEDIA_RECOVERIES) {
                  // Media error — try a recovery before giving up on this server.
                  recoveries += 1;
                  hls.recoverMediaError();
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
  }, [isHydrated, isUpcoming, activeKey, activeUrl, attempt, kind]);

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
    const root = stageRef.current;
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
    if (onRefreshLinks) {
      startRefresh(async () => {
        // Tiles must receive fresh signatures before starting another decoder;
        // otherwise an expired singleton can exhaust again before links arrive.
        try { await onRefreshLinks(); } catch { /* retain/retry the existing list */ }
        dispatch({ type: 'retryAll' });
      });
    } else {
      dispatch({ type: 'retryAll' });
      startRefresh(() => router.refresh());
    }
  };

  /** Viewer-initiated "Retry all": a fresh start, so automatic rounds are re-armed too. */
  const retryAllNow = () => {
    setAutoRetryRound(0);
    retryAllServers();
  };

  /** The viewer says the current server is not playing (e.g. a provider error page). */
  const reportNotPlaying = () => dispatch({ type: 'skip', attempt });

  /* ------------------------------------------------------------------------ */
  /*  Automatic retry once every server failed (backed-off rounds)            */
  /* ------------------------------------------------------------------------ */
  const autoRetryMs = phase === 'exhausted' && servers.length > 0 && !isUpcoming ? autoRetryDelay(autoRetryRound) : null;
  const autoRetryArmed = isHydrated && !isRefreshing && autoRetryMs !== null && retryCancelledAttempt !== attempt;
  const onAutoRetry = useEffectEvent(() => {
    setAutoRetryRound((round) => round + 1);
    retryAllServers();
  });

  useEffect(() => {
    if (!autoRetryArmed) return undefined;
    let remaining = Math.round(autoRetryMs / 1000);
    // Counts visible seconds only, like the playback watchdogs.
    const id = setInterval(() => {
      if (document.hidden) return;
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(id);
        onAutoRetry();
        return;
      }
      setRetryTick({ attempt, remaining });
    }, 1000);
    return () => clearInterval(id);
  }, [autoRetryArmed, autoRetryMs, attempt]);

  const retryCountdown = autoRetryArmed
    ? retryTick.attempt === attempt
      ? retryTick.remaining
      : Math.round(autoRetryMs / 1000)
    : null;

  /* ------------------------------------------------------------------------ */
  /*  Server status helper                                                    */
  /* ------------------------------------------------------------------------ */
  const statusOf = (server) => {
    if (server.key === activeKey) {
      if (phase === 'ready') return 'playing';
      if (phase === 'connecting') return 'connecting';
      return 'failed';
    }
    if (failed[server.key]) return 'failed';
    return server.health?.status === 'offline' ? 'offline' : server.health?.status === 'live' ? 'live' : server.health?.status === 'checking' ? 'checking' : 'idle';
  };

  const selectServer = (server) => dispatch({ type: 'select', index: state.keys.indexOf(server.key) });

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
    <div className="relative overflow-hidden rounded-2xl text-zinc-100 shadow-2xl" data-stream-player={compact ? 'compact' : 'full'}>
      {/* Stage: the media plus everything that floats over it (and what goes fullscreen) */}
      <div ref={stageRef} className="player-stage group relative bg-black">
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
            className={`aspect-video w-full object-contain bg-black ${isTheaterMode ? 'lg:h-[70vh] lg:aspect-auto' : ''}`}
          />
        ) : kind === 'embed' && isHydrated && activeServer ? (
          // Never sandboxed: provider players refuse to run in a sandboxed frame.
          <iframe
            key={`${activeKey}#${attempt}`}
            ref={frameRef}
            src={activeServer.url}
            title={matchTitle || 'Embedded player'}
            className={`aspect-video w-full border-0 bg-black ${isTheaterMode ? 'lg:h-[70vh] lg:aspect-auto' : ''}`}
            allow={EMBED_IFRAME_ALLOW}
            allowFullScreen
            referrerPolicy={EMBED_REFERRER_POLICY}
            data-player-frame=""
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
            <p className="max-w-sm text-xs text-zinc-300">
              {activeKey ? describeFailure(failed[activeKey]) : 'No stream resolved for this match yet.'}
            </p>
            {phase === 'exhausted' && retryCountdown !== null && (
              <p className="inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1 text-[11px] font-bold text-lime-300" data-auto-retry="">
                <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Retrying every server in {retryCountdown}s
                <button
                  type="button"
                  onClick={() => setRetryCancelledAttempt(attempt)}
                  className="cursor-pointer rounded-full px-1.5 text-zinc-300 underline-offset-2 hover:text-white hover:underline"
                >
                  Cancel
                </button>
              </p>
            )}
            {phase === 'exhausted' && autoRetryMs === null && servers.length > 0 && (
              <p className="text-[11px] font-semibold text-zinc-400">Automatic retries paused — try again when you are ready.</p>
            )}
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
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300/40 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-zinc-200 transition-all hover:bg-white/10 active:scale-95"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Try next server
                </button>
              )}
              <button
                type="button"
                onClick={retryAllNow}
                disabled={isRefreshing}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300/40 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-zinc-200 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-60"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {isRefreshing ? 'Re-signing links…' : phase === 'exhausted' && retryCountdown !== null ? 'Retry now' : 'Retry all'}
              </button>
            </div>
          </div>
        )}

        {/* Automatic switch notice */}
        {switched && (
          <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime-500/30 bg-navy-900/95 px-3 py-1.5 text-[10px] font-bold text-lime-300 shadow-lg">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {`Switched to ${activeServer?.label || 'another server'} · ${describeFailure(switched.reason)}`}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: 'dismissSwitch' })}
              className="cursor-pointer rounded px-1 text-zinc-300 transition-colors hover:text-zinc-100"
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

            <div className="flex flex-wrap items-center justify-between gap-2">
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
                {!compact && <>
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
                </>}
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

        {/* DVR status pill, pinned inside the video while it plays */}
        {isVideo && isHydrated && activeKey && !isDown && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full border border-lime-500/30 bg-black/65 px-3 py-1 text-[11px] font-bold text-lime-300 backdrop-blur-md" data-dvr-pill="">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
            {compact ? 'LIVE' : statusLabel}
          </div>
        )}

        {/* Compact server switcher while fullscreen (the selector below is out of view) */}
        {hasMultiple && !isUpcoming && (isFullscreen || compact) && (
          <ServerMenu servers={serversEnriched} activeKey={activeKey} statusOf={statusOf} failed={failed} onSelect={selectServer} />
        )}
      </div>

      {/* Server selector: only when there is something to choose between */}
      {hasMultiple && !isUpcoming && !compact && (
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

      {/* Action toolbar (player status, Next server, Refresh, Theater, Fullscreen) */}
      <div className={compact ? "glass-dark flex flex-wrap items-center justify-between gap-2 rounded-b-2xl p-2" : "glass-dark flex flex-col justify-between gap-3 rounded-b-2xl p-3 sm:p-4 lg:flex-row lg:items-center"} data-player-toolbar="">
        <div className={`glass-dark-tile flex min-w-0 items-center gap-2.5 rounded-xl text-left ${compact ? 'flex-1 p-2' : 'w-full p-2.5 lg:w-auto'}`}>
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className={`absolute inline-flex h-full w-full rounded-full ${isDown ? 'bg-red-500' : 'live-dot bg-lime-500'}`} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[10px] font-extrabold uppercase tracking-wider text-lime-300">
              {kind === 'embed' ? 'Provider player' : 'Direct stream'}
              {activeServer ? ` · ${activeServer.label}` : ''}
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-snug text-zinc-300">
              {activeServer?.health?.status === 'live'
                ? `${activeServer.quality} · ${activeServer.health.latencyMs} ms · ${Math.round(activeServer.health.successRate * 100)}% probe success`
                : compact ? 'Auto-failover on' : kind === 'embed'
                  ? 'Provider frame · auto-failover & retry armed'
                  : 'Checking stream health · auto-failover & retry armed'}
            </span>
          </div>
        </div>

        <div className={`flex flex-wrap items-center justify-end gap-2 ${compact ? '' : 'w-full lg:w-auto'}`}>
          {activeKey && !isUpcoming && !isDown && (
            <button
              type="button"
              onClick={reportNotPlaying}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                kind === 'embed'
                  ? 'border-lime-500/45 bg-lime-500/10 text-lime-300 hover:bg-lime-500/20'
                  : 'border-white/10 bg-white/5 text-zinc-200 hover:border-lime-500/40 hover:text-white'
              }`}
              title={hasMultiple ? 'Not playing? Switch to the next server' : 'Not playing? Reload the player'}
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{hasMultiple ? 'Next server' : 'Reload player'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={reloadStream}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-all hover:border-lime-500/40 hover:text-white active:scale-95"
            title="Reload Stream Connection"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBuffering ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {!compact && <button
            type="button"
            onClick={() => setIsTheaterMode((on) => !on)}
            aria-pressed={isTheaterMode}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${isTheaterMode ? 'border-lime-500/45 bg-lime-500/15 text-lime-300 hover:bg-lime-500/25' : 'border-white/10 bg-white/5 text-zinc-200 hover:border-lime-500/40 hover:text-white'}`}
            title={isTheaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
          >
            <Cpu className={`h-3.5 w-3.5 ${isTheaterMode ? 'animate-pulse' : ''}`} />
            <span>{isTheaterMode ? 'Normal Mode' : 'Theater'}</span>
          </button>}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 transition-all hover:border-lime-500/40 hover:text-white active:scale-95"
            title="Toggle Fullscreen"
          >
            <Maximize className="h-3.5 w-3.5" />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>

      {activeServer?.provider?.includes('fallback') && (
        <p role="status" className="border-t border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200" data-unverified-backup="">Unverified backup channel — this source may show a different fixture.</p>
      )}

      {/* Screen-reader announcements for failures and automatic switches */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
