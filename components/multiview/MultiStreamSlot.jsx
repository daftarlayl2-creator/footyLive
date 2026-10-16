'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import StreamPlayer from '@/components/StreamPlayer';
import TacticalRadarPlayer from '@/components/player/TacticalRadarPlayer';

/** One independent player/decoder, with cancellable resolution and fresh signed-link retries. */
export default function MultiStreamSlot({ source }) {
  const [resolved, setResolved] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const controller = useRef(null);
  const endpoint = source.type === 'channel'
    ? `/api/channels/${encodeURIComponent(source.id)}/streams`
    : `/api/streams/${encodeURIComponent(source.id)}`;

  const resolve = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const response = await fetch(`${endpoint}?multiview=1`, { cache: 'no-store', signal: request.signal });
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok || !Array.isArray(data.streams) || !data.streams.length) throw new Error(data.error || 'No active servers are available for this source yet.');
      setResolved(data);
      setError('');
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to resolve this stream.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const initial = setTimeout(resolve, 0);
    return () => { clearTimeout(initial); controller.current?.abort(); };
  }, [resolve]);

  if (!resolved) {
    // All feeds offline for this tile: the interactive tactical-radar backup
    // player takes the screen instead of a black slot or a raw error card.
    return (
      <div className="relative" aria-busy={loading}>
        <TacticalRadarPlayer matchId={source.type === 'match' ? source.id : source.title || 'channel'} title={source.title || ''} compact />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-black/80 p-3 text-center backdrop-blur-md">
          {loading ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin text-lime-400" aria-hidden="true" />
              <p role="status" className="text-xs font-bold text-zinc-300">Resolving &amp; checking stream health…</p>
            </>
          ) : (
            <>
              <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                {error}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">Tactical radar backup engaged</p>
              <button type="button" onClick={resolve} className="tactile rounded-xl border border-lime-400/30 px-3 py-2 text-xs font-bold text-lime-200">Retry source</button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      <StreamPlayer
        compact
        initialMuted
        streamUrl={resolved.defaultUrl}
        channels={resolved.streams}
        stream1={resolved.stream1}
        stream2={resolved.stream2}
        stream3={resolved.stream3}
        matchTitle={resolved.matchTitle || source.title}
        matchStatus={resolved.matchStatus || 'live'}
        onRefreshLinks={resolve}
        matchId={source.type === 'match' ? source.id : undefined}
      />
      {error && <p role="status" className="bg-amber-500/10 p-2 text-[11px] text-amber-200">Fresh links are temporarily unavailable. Existing playback has been kept.</p>}
    </>
  );
}
