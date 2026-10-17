'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Play, RadioTower, RefreshCw, Search } from 'lucide-react';

const POLL_MS = 60_000;
const ORDER = { live: 0, checking: 1, unknown: 2, offline: 3 };

const STATUS_META = {
  live: {
    label: 'Live',
    dot: 'bg-navy-950',
    ping: true,
    // Brand LIVE badge: solid live-red (#FF4D4D via the red-500 token), ink text.
    pill: 'bg-red-500 border-red-500 text-navy-950',
  },
  checking: {
    label: 'Checking',
    dot: 'bg-amber-400',
    ping: true,
    pill: 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400',
  },
  unknown: {
    // Probe blocked by the CDN / not verifiable — still fully playable.
    label: 'Standby',
    dot: 'bg-lime-300 dark:bg-lime-400',
    ping: false,
    pill: 'bg-navy-100/70 border-navy-200 text-navy-600 dark:bg-navy-900 dark:border-navy-750 dark:text-zinc-300',
  },
  offline: {
    label: 'Unreachable',
    dot: 'bg-red-500',
    ping: false,
    pill: 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400',
  },
};

export function StatusIndicator({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold transition-colors duration-500 ${meta.pill}`}
      data-status={status}
    >
      <span className="relative flex h-1.5 w-1.5">
        {meta.ping && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${meta.dot}`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full transition-colors duration-500 ${meta.dot} ${status === 'live' ? 'live-dot' : ''}`} />
      </span>
      {meta.label}
    </span>
  );
}

function ChannelLogo({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-100 dark:bg-navy-950 border border-navy-200 dark:border-navy-750">
        <RadioTower className="h-4 w-4 text-lime-500" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-xl object-contain bg-white dark:bg-navy-950 p-1 ring-1 ring-navy-200 dark:ring-navy-800 group-hover:ring-lime-500/50 transition-all"
    />
  );
}

function ChannelCard({ channel }) {
  const isOffline = channel.status === 'offline';
  return (
    <Link
      href={channel.href}
      className="tactile-soft group relative flex flex-col gap-3 overflow-hidden rounded-3xl glass-panel glass-panel-hover p-4"
      title={isOffline ? 'The probe could not reach this source — playback is still attempted through the proxy.' : 'Play through the Limon proxy'}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(198,255,0,0.14),transparent_60%)]" />
      <div className="relative flex items-start gap-3 min-w-0">
        <ChannelLogo src={channel.logo} name={channel.name} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-navy-800 dark:text-zinc-100 line-clamp-2 group-hover:text-lime-600 dark:group-hover:text-white transition-colors">
            {channel.name}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-navy-500 dark:text-zinc-400">
            {channel.group || 'Live feed'}
            {channel.source ? ` · ${channel.source}` : ''}
          </p>
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-2">
        <StatusIndicator status={channel.status} />
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lime-600 dark:text-lime-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="h-3 w-3 fill-lime-500/30" />
          {isOffline ? 'Try anyway' : 'Watch'}
        </span>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return <div className="h-[104px] rounded-3xl glass-panel animate-pulse" />;
}

export default function LiveChannelsGrid({ initialChannels = null, initialCheckedAt = null }) {
  const [channels, setChannels] = useState(initialChannels); // seeded server-side
  const [error, setError] = useState(null);
  const [checkedAt, setCheckedAt] = useState(initialCheckedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // Channels are visible by default — a blocked probe must never hide them.
  const [showOffline, setShowOffline] = useState(true);

  const load = useCallback(async (signal) => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/live-channels', { cache: 'no-store', signal });
      const data = await res.json();
      // Even an "error" response carries the channel list we already know;
      // always prefer the freshest list available. Never show a scary banner:
      // a failed refresh quietly keeps the last known list.
      if (Array.isArray(data.channels) && data.channels.length > 0) {
        setChannels(data.channels);
        setCheckedAt(data.checkedAt || Date.now());
        setError(null);
      } else if (!res.ok) {
        setError('Channel list refresh is running behind — showing the last known list.');
      } else {
        setChannels((prev) => prev ?? data.channels ?? []);
        setCheckedAt(data.checkedAt || Date.now());
        setError(null);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Live status checks are running behind — channels below still attempt playback.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => load(controller.signal), 0);
    const timer = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const counts = useMemo(() => {
    const c = { live: 0, standby: 0, offline: 0, total: channels?.length ?? 0 };
    for (const ch of channels || []) {
      if (ch.status === 'live') c.live++;
      else if (ch.status === 'offline') c.offline++;
      else c.standby++;
    }
    return c;
  }, [channels]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (channels || [])
      .filter((ch) => showOffline || ch.status !== 'offline')
      .filter((ch) => !q || ch.name.toLowerCase().includes(q) || (ch.group || '').toLowerCase().includes(q))
      .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || a.name.localeCompare(b.name));
  }, [channels, query, showOffline]);

  return (
    <div className="space-y-5 w-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-lime-600 dark:text-lime-400">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-lime-500" />
            {counts.live} live
          </span>
          <span className="inline-flex items-center gap-1.5 text-navy-600 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300 dark:bg-lime-400" />
            {counts.standby} standby
          </span>
          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {counts.offline} unreachable
          </span>
          <span className="text-navy-500 dark:text-zinc-400">{counts.total} total</span>
          {checkedAt && (
            <span className="text-navy-500 dark:text-zinc-400 font-medium">
              · checked {new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-navy-500 dark:text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOffline}
              onChange={(e) => setShowOffline(e.target.checked)}
              className="accent-lime-500"
            />
            Show all statuses
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400 dark:text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels…"
              className="w-44 sm:w-48 rounded-lg border border-navy-200 bg-white py-1.5 pl-8 pr-3 text-xs text-navy-800 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-lime-500/40 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-200"
            />
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1.5 text-xs font-bold text-navy-600 hover:text-lime-600 hover:border-lime-500/40 disabled:opacity-60 dark:border-navy-750 dark:text-zinc-400 dark:hover:text-lime-400 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Explanatory banner — replaced the old dead-end "0 live / N offline" state */}
      <div className="flex items-start gap-2.5 rounded-xl border border-lime-500/25 bg-lime-500/[0.06] px-4 py-3 text-[11.5px] font-semibold text-navy-700 dark:text-zinc-300">
        <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-lime-500" />
        <p>
          Every channel below plays through the signed <code className="font-mono text-[10.5px] text-lime-600 dark:text-lime-400">/api/proxy</code> route.
          Status probes are best-effort — a blocked or unverifiable probe shows as
          <span className="text-lime-600 dark:text-lime-400"> Standby</span> and never hides the channel: click it and playback is attempted anyway.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error} {channels?.length ? 'Showing the last known list.' : ''}
        </div>
      )}

      {/* Body */}
      {channels === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-navy-200 dark:border-navy-750 bg-white/70 dark:bg-navy-950 p-8 text-center">
          <p className="text-sm font-bold text-navy-800 dark:text-zinc-200">
            {channels.length > 0 ? 'No channels match your filters' : 'No live channels in the feed right now'}
          </p>
          <p className="mt-1 text-xs text-navy-500 dark:text-zinc-400">The list refreshes automatically every minute.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-500 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
