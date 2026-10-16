'use client';

import { useState } from 'react';
import StreamPlayer from '@/components/StreamPlayer';
import LiveReactions from '@/components/reactions/LiveReactions';
import ErrorBoundary from '@/components/ErrorBoundary';
import LiveChannelPicker from './LiveChannelPicker';
import { ArrowLeft, MonitorPlay } from 'lucide-react';

/**
 * Watch-page player hub.
 *
 * Owns the active source list so the two selection surfaces the page exposes —
 * the player's own **server selector** (Server 1, Server 2, … Backup) and the
 * **manual live-channel list** below it — can swap streams in place without a
 * reload. Choosing a channel keeps the previous list in memory, so "Back to
 * match servers" restores the fixture's servers instantly.
 */
export default function WatchStreamHub({
  matchId,
  streamUrl = null,
  channels = [],
  stream1 = null,
  stream2 = null,
  stream3 = null,
  matchTitle,
  matchStatus,
  initialLockedCount = 0,
  initialChannelId = null,
}) {
  const [matchSources] = useState({ streamUrl, channels: channels || [], stream1, stream2, stream3 });
  const [active, setActive] = useState(() => ({
    streamUrl,
    channels: channels || [],
    stream1,
    stream2,
    stream3,
    label: null,
    channelId: initialChannelId,
    lockedCount: initialLockedCount,
  }));

  const usingChannel = Boolean(active.channelId);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-watch-stream-hub="">
      {usingChannel && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-lime-500/30 bg-navy-900/70 px-3.5 py-2.5">
          <p className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-zinc-100">
            <MonitorPlay className="h-3.5 w-3.5 shrink-0 text-lime-400" aria-hidden="true" />
            <span className="truncate">Now playing channel: {active.label}</span>
          </p>
          <button
            type="button"
            onClick={() => setActive({ ...matchSources, label: null, channelId: null, lockedCount: initialLockedCount })}
            className="tactile inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-extrabold text-zinc-100 hover:border-lime-500/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to match servers
          </button>
        </div>
      )}

      <div className="relative">
        <StreamPlayer
          key={usingChannel ? `channel-${active.channelId}` : 'match'}
          matchId={matchId}
          streamUrl={active.streamUrl}
          channels={active.channels}
          stream1={active.stream1}
          stream2={active.stream2}
          stream3={active.stream3}
          matchTitle={usingChannel ? active.label || matchTitle : matchTitle}
          matchStatus={matchStatus}
        />
        {/* Match soundboard & live reactions: floating bubbles + shared counters
            over the stream (independent of the player, so it survives failover). */}
        {matchStatus !== 'upcoming' && (
          <ErrorBoundary name="live-reactions" title="Reactions hit a snag" message="The reaction rail could not load — playback is unaffected.">
            <LiveReactions matchId={matchId} />
          </ErrorBoundary>
        )}
      </div>

      <LiveChannelPicker
        matchTitle={matchTitle}
        activeChannelId={active.channelId}
        onPlay={({ channel, streams, defaultUrl, lockedCount }) => {
          setActive({
            streamUrl: defaultUrl,
            channels: streams,
            label: channel.name,
            channelId: channel.id,
            lockedCount: Number(lockedCount) || 0,
          });
          // Bring the swapped-in player into view.
          if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
              document.querySelector('[data-watch-stream-hub]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }
        }}
      />
    </div>
  );
}
