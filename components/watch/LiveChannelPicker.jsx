'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Radio, RefreshCw, Search, Server as ServerIcon, Tv } from 'lucide-react';
import { channelGroups, normalizeChannelList, selectChannels, statusLabel } from '@/lib/live/channelSelection';

const STATUS_STYLES = {
  live: 'border-lime-500/50 bg-lime-500/15 text-lime-200',
  unknown: 'border-white/10 bg-white/5 text-zinc-300',
  offline: 'border-red-500/30 bg-red-500/10 text-red-200',
};

const DOT_STYLES = { live: 'bg-lime-500', unknown: 'bg-amber-400', offline: 'bg-red-500' };
const VISIBLE_LIMIT = 60;

/**
 * Manual live-channel list on the watch page.
 *
 * Lists the aggregated M3U/IP-TV channels right under the player so a viewer can
 * jump to any on-air channel instantly when a match server is offline. Selecting
 * a channel resolves its signed `/api/channels/{id}/streams` links and hands
 * them to the parent, which swaps the player's source list in place — no reload,
 * no dead end. Offline/standby channels stay clickable: probes are often blocked
 * server-side while the stream itself plays fine through the proxy.
 */
export default function LiveChannelPicker({ onPlay, activeChannelId = null, matchTitle = '', className = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [hideOffline, setHideOffline] = useState(false);

  /**
   * The feed list loads through an async effect (never a synchronous setState
   * in the effect body). `reloadKey` re-runs it when the viewer taps Refresh.
   */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // probe=0: the list itself never blocks on upstream probes here; the
        // player keeps probing the servers it actually plays.
        const response = await fetch('/api/live-channels?probe=0', { cache: 'no-store' });
        if (cancelled) return;
        if (!response.ok) throw new Error('unavailable');
        const data = normalizeChannelList(await response.json());
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('The channel feeds could not be loaded. Retry in a moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((value) => value + 1);
  };

  const channels = useMemo(() => {
    // Every channel is listed and clickable by default (a blocked probe is not
    // proof the stream is dead); on-air channels and sports groups sort first.
    const rows = selectChannels(payload, { query });
    const visible = hideOffline ? rows.filter((channel) => channel.status !== 'offline') : rows;
    return group ? visible.filter((channel) => channel.group === group) : visible;
  }, [payload, query, group, hideOffline]);

  const groups = useMemo(() => channelGroups(payload?.channels || [], 10), [payload]);

  const playChannel = async (channel) => {
    setPlayingId(channel.id);
    setError(null);
    try {
      const response = await fetch(`/api/channels/${encodeURIComponent(channel.id)}/streams`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.streams?.length) {
        setError(data?.error || `${channel.name} has no playable stream right now — try another channel.`);
        return;
      }
      onPlay?.({
        channel,
        streams: data.streams,
        defaultUrl: data.defaultUrl || data.streams[0]?.url || null,
        lockedCount: Number(data.lockedCount) || 0,
      });
    } catch {
      setError(`${channel.name} could not be reached. Try another channel or the match servers.`);
    } finally {
      setPlayingId(null);
    }
  };

  return (
    <section
      aria-labelledby="live-channels-heading"
      className={`glass-dark overflow-hidden rounded-3xl ${className}`}
      data-live-channel-picker=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-lime-500/15 text-lime-300">
            <Tv className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="live-channels-heading" className="text-sm font-extrabold tracking-tight text-white">Live channels</h2>
            <p className="text-[11px] font-semibold text-zinc-300">
              {matchTitle ? `Switch away from ${matchTitle} instantly — ` : ''}every aggregated M3U/IP-TV channel, on air or standby.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {payload && (
            <span className="glass-dark-tile inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums text-zinc-100">
              <Radio className="h-3.5 w-3.5 text-lime-400" aria-hidden="true" />
              {payload.counts.live} live · {payload.counts.standby} standby · {payload.counts.total} total
            </span>
          )}
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="tactile inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] font-extrabold text-zinc-100 hover:border-lime-500/40 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
        <label className="relative flex min-w-[12rem] flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span className="sr-only">Search live channels</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search channels (beIN, Sky, Canal+, CCTV-5…)"
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-8 pr-3 text-xs text-white placeholder-zinc-400 outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20"
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={hideOffline}
          onClick={() => setHideOffline((value) => !value)}
          title="Hide channels whose probe answered 404/410. Blocked probes stay listed as Standby."
          className={`tactile inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-extrabold ${
            hideOffline ? 'border-lime-500/50 bg-lime-500/10 text-lime-200' : 'border-white/10 bg-white/5 text-zinc-200'
          }`}
        >
          Hide offline
        </button>

        {groups.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Channel groups">
            <button
              type="button"
              onClick={() => setGroup('')}
              aria-pressed={group === ''}
              className={`rounded-lg border px-2 py-1 text-[10px] font-extrabold ${group === '' ? 'border-lime-500/50 bg-lime-500/10 text-lime-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}
            >
              All groups
            </button>
            {groups.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setGroup(name === group ? '' : name)}
                aria-pressed={group === name}
                className={`rounded-lg border px-2 py-1 text-[10px] font-extrabold ${group === name ? 'border-lime-500/50 bg-lime-500/10 text-lime-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-white/10 bg-red-500/10 px-4 py-2 text-[11px] font-semibold text-red-100 sm:px-5">
          {error}
        </p>
      )}

      <div className="border-t border-white/10">
        {loading && !payload ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="block h-11 animate-pulse rounded-xl bg-white/5 motion-reduce:animate-none" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs font-semibold text-zinc-300 sm:px-5">
            No channel matches “{query}”. Clear the search or refresh the feeds.
          </p>
        ) : (
          <ul role="list" className="grid max-h-[22rem] gap-1.5 overflow-y-auto p-3 sm:grid-cols-2 sm:p-4" data-channel-count={channels.length}>
            {channels.slice(0, VISIBLE_LIMIT).map((channel) => (
              <li key={channel.id}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => playChannel(channel)}
                    disabled={playingId === channel.id}
                    aria-label={`Play ${channel.name} (${statusLabel(channel.status)}) here`}
                    className={`tactile flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-bold transition-colors disabled:opacity-60 ${
                      activeChannelId === channel.id
                        ? 'border-lime-500/60 bg-lime-500/15 text-lime-100'
                        : 'border-white/10 bg-white/[0.03] text-zinc-100 hover:border-lime-500/40 hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STYLES[channel.status]}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                    {channel.quality && <span className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-zinc-300">{channel.quality}</span>}
                    {playingId === channel.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <ServerIcon className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                    )}
                  </button>
                  <span className={`shrink-0 rounded-lg border px-1.5 py-1 text-[9px] font-extrabold uppercase ${STATUS_STYLES[channel.status]}`}>
                    {statusLabel(channel.status)}
                  </span>
                  <Link
                    href={channel.href}
                    prefetch={false}
                    className="hidden shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[9px] font-extrabold uppercase text-zinc-300 hover:text-white sm:block"
                  >
                    Page
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {channels.length > VISIBLE_LIMIT && (
          <p className="px-4 pb-3 text-center text-[10.5px] font-semibold text-zinc-400 sm:px-5">
            Showing the first {VISIBLE_LIMIT} of {channels.length} matching channels — search to narrow the list.
          </p>
        )}
      </div>
    </section>
  );
}
