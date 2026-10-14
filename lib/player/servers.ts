/**
 * Server list + automatic failover model for <StreamPlayer>.
 *
 * Pure and isomorphic (no DOM, no Node APIs) so the exact same rules run in the
 * browser, in the stream engine on the server, and in unit tests.
 *
 *  - `buildServerList()` turns the channels a page passes in into labelled
 *    servers: "Server 1", "Server 2", …, and "Backup" for the last of several.
 *  - `failoverReducer()` is the state machine the player drives: when the
 *    current server fails it moves on to the next one nobody has tried yet in
 *    this failover chain, and reports `exhausted` once every server failed.
 */

export type StreamKind = 'hls' | 'mp4' | 'embed';
export type ServerQuality = 'HD' | 'SD';

/** Shape of the channel objects pages hand to the player (see `Channel` in lib/types). */
export interface ChannelLike {
  name?: string;
  url?: string;
  proxiedUrl?: string;
  quality?: string;
  provider?: string;
  kind?: string;
}

export interface PlayerServer {
  /** Position in the list (0-based). */
  index: number;
  /** Identity that survives re-signing of the same upstream link (new exp/sig). */
  key: string;
  /** "Server 1", "Server 2", …, "Backup". */
  label: string;
  /** URL the browser loads: signed proxy / redirect link when one exists. */
  url: string;
  kind: StreamKind;
  quality: ServerQuality;
  /** Original channel name, for tooltips. */
  name: string;
  provider?: string;
}

/* -------------------------------------------------------------------------- */
/*  Link classification                                                       */
/* -------------------------------------------------------------------------- */

// Mirrors PROXY_PATH in lib/hlsProxy.ts (not imported: that module needs Node's crypto).
const PROXY_PATH = '/api/proxy';
const REDIRECT_PATH = '/api/stream-redirect';

/** Query params of one of our own relative signed links, or null. */
function ownLinkParams(url: string, path: string): URLSearchParams | null {
  return url.startsWith(`${path}?`) ? new URLSearchParams(url.slice(path.length + 1)) : null;
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/** 'hls' / 'mp4' for URLs that look like direct media, otherwise null. */
function classifyMedia(url: string): 'hls' | 'mp4' | null {
  const path = pathnameOf(url);
  if (/\.m3u8?$/i.test(path)) return 'hls';
  if (/\.(mp4|m4v|mov|webm)$/i.test(path)) return 'mp4';
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8') || lower.includes('/hls/')) return 'hls';
  if (lower.includes('.mp4')) return 'mp4';
  return null;
}

/**
 * How the player should load a URL: through hls.js, as a plain media file, or
 * in an iframe. Signed `/api/proxy` links are classified by the upstream URL
 * they carry (whose `/hls/` path is URL-encoded and invisible to a naive
 * substring check).
 */
export function detectStreamKind(url: string | null | undefined): StreamKind | null {
  if (!url) return null;
  const proxied = ownLinkParams(url, PROXY_PATH);
  if (proxied) {
    // The proxy only relays direct media and sniffs extension-less playlists.
    return classifyMedia(proxied.get('url') || '') ?? 'hls';
  }
  if (ownLinkParams(url, REDIRECT_PATH)) return 'embed';
  return classifyMedia(url) ?? 'embed';
}

function isStreamKind(v: unknown): v is StreamKind {
  return v === 'hls' || v === 'mp4' || v === 'embed';
}

/** Identity of a server that ignores the expiry/signature of our signed links. */
export function serverKey(url: string): string {
  const proxied = ownLinkParams(url, PROXY_PATH);
  if (proxied?.get('url')) return `proxy:${proxied.get('url')}|${proxied.get('ref') || ''}`;
  const redirect = ownLinkParams(url, REDIRECT_PATH);
  if (redirect?.get('u')) return `redirect:${redirect.get('u')}`;
  return url;
}

/* -------------------------------------------------------------------------- */
/*  Labels                                                                    */
/* -------------------------------------------------------------------------- */

const HD_QUALITIES = new Set(['HD', 'FHD', 'UHD', '4K', '2160P', '1440P', '1080P', '1080I', '720P']);

export function normalizeQuality(quality: string | null | undefined): ServerQuality {
  return quality && HD_QUALITIES.has(String(quality).trim().toUpperCase()) ? 'HD' : 'SD';
}

/** "Server 1", "Server 2", … with the last of several servers called "Backup". */
export function serverLabel(index: number, total: number): string {
  return total > 1 && index === total - 1 ? 'Backup' : `Server ${index + 1}`;
}

/**
 * Labelled, de-duplicated servers for the player. Channels without a usable
 * URL are skipped; `fallbackUrl` is used only when no channel is usable.
 */
export function buildServerList(
  channels: ChannelLike[] | null | undefined,
  fallbackUrl?: string | null
): PlayerServer[] {
  const seen = new Set<string>();
  const usable: Omit<PlayerServer, 'index' | 'label'>[] = [];

  for (const ch of channels ?? []) {
    const url = ch?.proxiedUrl || ch?.url;
    if (!url) continue;
    const key = serverKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    usable.push({
      key,
      url,
      kind: isStreamKind(ch.kind) ? ch.kind : detectStreamKind(url) ?? 'embed',
      quality: normalizeQuality(ch.quality),
      name: ch.name || '',
      provider: ch.provider,
    });
  }

  if (usable.length === 0 && fallbackUrl) {
    usable.push({
      key: serverKey(fallbackUrl),
      url: fallbackUrl,
      kind: detectStreamKind(fallbackUrl) ?? 'embed',
      quality: 'SD',
      name: '',
    });
  }

  return usable.map((s, index) => ({ ...s, index, label: serverLabel(index, usable.length) }));
}

/* -------------------------------------------------------------------------- */
/*  Failover state machine                                                    */
/* -------------------------------------------------------------------------- */

export type FailureReason = 'network' | 'media' | 'timeout' | 'stalled' | 'unsupported';

/**
 *  - connecting: the active server is loading
 *  - ready:      the active server is delivering media (it may be paused)
 *  - failed:     the active server failed and auto-switch is off
 *  - exhausted:  every server failed in this failover chain
 */
export type PlayerPhase = 'connecting' | 'ready' | 'failed' | 'exhausted';

export interface FailoverState {
  /** Server keys in display order. */
  keys: string[];
  /** Index of the server being played. */
  active: number;
  /** Bumped on every (re)start, so events from a torn-down player are ignored. */
  attempt: number;
  phase: PlayerPhase;
  /** Last failure per server key; cleared when that server is tried again. */
  failed: Record<string, FailureReason>;
  /** Keys attempted in the current failover chain (reset by a manual choice or stable playback). */
  tried: string[];
  autoSwitch: boolean;
  /** Set when the player switched servers on its own, for the on-screen notice. */
  switched: { from: number; to: number; reason: FailureReason } | null;
}

export type FailoverAction =
  /** User picked a server. */
  | { type: 'select'; index: number }
  /** Restart the active server. */
  | { type: 'reload' }
  /** User asked for the next server (manual mode). */
  | { type: 'next' }
  /** Forget all failures and start again from Server 1. */
  | { type: 'retryAll' }
  /** The active server started delivering media. */
  | { type: 'ready'; attempt: number }
  /** The active server has played long enough to be trusted again. */
  | { type: 'stable'; attempt: number }
  /** The active server failed. */
  | { type: 'fail'; attempt: number; reason: FailureReason }
  /** The page passed a different server list. */
  | { type: 'sync'; keys: string[] }
  | { type: 'setAutoSwitch'; enabled: boolean }
  | { type: 'dismissSwitch' };

export function initFailoverState(keys: string[], autoSwitch = true): FailoverState {
  return {
    keys,
    active: 0,
    attempt: 1,
    phase: keys.length ? 'connecting' : 'exhausted',
    failed: {},
    tried: keys.length ? [keys[0]] : [],
    autoSwitch,
    switched: null,
  };
}

/**
 * Next server to try after `active`: walk the list in order (wrapping round),
 * skip servers already tried in this chain, and prefer ones that have not
 * failed earlier. Returns -1 when every server has been tried.
 */
export function pickNextServer(
  keys: string[],
  active: number,
  tried: string[],
  failed: Record<string, unknown>
): number {
  let previouslyFailed = -1;
  for (let step = 1; step < keys.length; step++) {
    const i = (active + step) % keys.length;
    if (tried.includes(keys[i])) continue;
    if (!(keys[i] in failed)) return i;
    if (previouslyFailed === -1) previouslyFailed = i;
  }
  return previouslyFailed;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/** Begin a fresh attempt on server `index`. */
function start(
  state: FailoverState,
  index: number,
  tried: string[],
  switched: FailoverState['switched']
): FailoverState {
  const key = state.keys[index];
  return {
    ...state,
    active: index,
    attempt: state.attempt + 1,
    phase: 'connecting',
    // A server being tried again is no longer shown as failed.
    failed: withoutKey(state.failed, key),
    tried,
    switched,
  };
}

export function failoverReducer(state: FailoverState, action: FailoverAction): FailoverState {
  const total = state.keys.length;

  switch (action.type) {
    case 'select': {
      const { index } = action;
      if (!Number.isInteger(index) || index < 0 || index >= total) return state;
      // Clicking the server that is already loading/playing must not restart it.
      if (index === state.active && (state.phase === 'connecting' || state.phase === 'ready')) return state;
      return start(state, index, [state.keys[index]], null);
    }

    case 'reload':
      if (!total) return state;
      return start(state, state.active, [state.keys[state.active]], null);

    case 'next': {
      if (!total) return state;
      const next = pickNextServer(state.keys, state.active, state.tried, state.failed);
      if (next === -1) {
        const index = (state.active + 1) % total;
        return start(state, index, [state.keys[index]], null);
      }
      return start(state, next, [...state.tried, state.keys[next]], null);
    }

    case 'retryAll':
      if (!total) return state;
      return start({ ...state, failed: {} }, 0, [state.keys[0]], null);

    case 'ready':
      if (action.attempt !== state.attempt || state.phase !== 'connecting') return state;
      return { ...state, phase: 'ready' };

    case 'stable':
      if (action.attempt !== state.attempt || state.phase !== 'ready') return state;
      return { ...state, tried: [state.keys[state.active]] };

    case 'fail': {
      if (action.attempt !== state.attempt) return state;
      if (state.phase !== 'connecting' && state.phase !== 'ready') return state;
      const key = state.keys[state.active];
      const failed = { ...state.failed, [key]: action.reason };
      const tried = state.tried.includes(key) ? state.tried : [...state.tried, key];
      if (!state.autoSwitch) return { ...state, failed, tried, phase: 'failed', switched: null };

      const next = pickNextServer(state.keys, state.active, tried, failed);
      if (next === -1) return { ...state, failed, tried, phase: 'exhausted', switched: null };
      return start({ ...state, failed }, next, [...tried, state.keys[next]], {
        from: state.active,
        to: next,
        reason: action.reason,
      });
    }

    case 'sync': {
      const { keys } = action;
      if (keys.length === total && keys.every((k, i) => k === state.keys[i])) return state;

      const present = new Set(keys);
      const failed = Object.fromEntries(Object.entries(state.failed).filter(([k]) => present.has(k)));
      const tried = state.tried.filter((k) => present.has(k));
      const base: FailoverState = { ...state, keys, failed, tried, switched: null };

      if (keys.length === 0) return { ...base, active: 0, phase: 'exhausted', attempt: state.attempt + 1 };

      const active = keys.indexOf(state.keys[state.active]);
      if (state.phase === 'exhausted') {
        // New servers showed up after everything failed: try the first fresh one.
        const fresh = keys.findIndex((k) => !(k in failed));
        if (fresh !== -1) return start(base, fresh, [keys[fresh]], null);
        return { ...base, active: Math.max(active, 0) };
      }
      // Same server still listed (maybe at a new position): keep playing it untouched.
      if (active !== -1) return { ...base, active };
      // The server we were playing disappeared: start again from the top.
      return start(base, 0, [keys[0]], null);
    }

    case 'setAutoSwitch':
      return state.autoSwitch === action.enabled ? state : { ...state, autoSwitch: action.enabled };

    case 'dismissSwitch':
      return state.switched ? { ...state, switched: null } : state;

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/*  Copy                                                                      */
/* -------------------------------------------------------------------------- */

const FAILURE_COPY: Record<FailureReason, string> = {
  network: 'Stream offline or unreachable',
  media: 'Stream data could not be decoded',
  timeout: 'Server took too long to respond',
  stalled: 'Playback stalled',
  unsupported: 'Format not supported by this browser',
};

export function describeFailure(reason: FailureReason | null | undefined): string {
  return (reason && FAILURE_COPY[reason]) || 'Stream unavailable';
}

/** "Server 1", "Server 1 and Backup", "Server 1, Server 2 and Backup". */
export function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
