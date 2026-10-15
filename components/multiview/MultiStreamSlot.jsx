'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import StreamPlayer from '@/components/StreamPlayer';

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
      const response = await fetch(endpoint, { cache: 'no-store', signal: request.signal });
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

  if (!resolved) return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center" aria-busy={loading}>
      {loading ? <><RefreshCw className="h-6 w-6 animate-spin text-lime-400" aria-hidden="true" /><p role="status" className="text-xs font-bold text-zinc-300">Resolving & checking stream health…</p></> : <>
        <AlertCircle className="h-6 w-6 text-amber-400" aria-hidden="true" />
        <p role="alert" className="text-xs font-semibold text-zinc-300">{error}</p>
        <button type="button" onClick={resolve} className="tactile rounded-xl border border-lime-400/30 px-3 py-2 text-xs font-bold text-lime-200">Retry source</button>
      </>}
    </div>
  );
  return (
    <>
      <StreamPlayer compact initialMuted streamUrl={resolved.defaultUrl} channels={resolved.streams} matchTitle={resolved.matchTitle || source.title} matchStatus={resolved.matchStatus || 'live'} onRefreshLinks={resolve} />
      {error && <p role="status" className="bg-amber-500/10 p-2 text-[11px] text-amber-200">Fresh links are temporarily unavailable. Existing playback has been kept.</p>}
    </>
  );
}
