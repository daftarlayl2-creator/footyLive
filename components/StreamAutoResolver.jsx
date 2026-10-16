'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { Crown, Film, RadioTower, RefreshCw, SearchX } from 'lucide-react';
import StreamPlayer from '@/components/StreamPlayer';
import { useSubscription } from '@/components/subscription/SubscriptionProvider';

/** Seconds of *visible* time between automatic re-resolutions; the last value repeats. */
export const AUTO_RESOLVE_DELAYS_S = [6, 12, 20, 30, 45, 60];

export function autoResolveDelay(attempt) {
  const index = Number.isInteger(attempt) && attempt > 0 ? Math.min(attempt, AUTO_RESOLVE_DELAYS_S.length - 1) : 0;
  return AUTO_RESOLVE_DELAYS_S[index];
}

const COPY = {
  premium: {
    icon: Crown,
    title: 'VIP-quality sources found',
    body: 'The responding sources are FHD / 4K and require a pass. You can unlock them above, or stay on free HD while we keep checking for a standard-quality source.',
  },
  searching: {
    icon: RadioTower,
    title: 'Finding a live stream…',
    body: 'No server has answered for this match yet. We keep mapping it against every active backup feed — Live-events, IPTV-Org and Guovin — and start playback automatically.',
  },
  finished: {
    icon: Film,
    title: 'Full time — live streams have ended',
    body: 'This fixture has finished, so live servers are no longer listed. Statistics and the play-by-play log below stay available.',
  },
  missing: {
    icon: SearchX,
    title: 'Match unavailable',
    body: 'This fixture is no longer listed by the data provider.',
  },
};

/**
 * Live match without a resolved server: instead of a dead "Stream is Offline"
 * card, keep re-resolving `/api/streams/[matchId]` — every resolution probes a
 * fresh window of the backup pools — and mount the player the moment servers
 * appear. Countdowns tick only while the tab is visible.
 */
export default function StreamAutoResolver({ matchId, matchTitle, matchStatus = 'live', initialReason = '', initialLockedCount = 0 }) {
  const { access } = useSubscription(matchId);
  const previousTier = useRef(access.tier);
  const [lockedCount, setLockedCount] = useState(initialLockedCount);
  const initialStop = matchStatus === 'finished' ? 'finished' : matchStatus === 'missing' ? 'missing' : null;
  const [resolved, setResolved] = useState(null);
  const [stopped, setStopped] = useState(initialStop);
  const [checking, setChecking] = useState(false);
  /** Unsuccessful checks so far; picks the next pause. */
  const [attempt, setAttempt] = useState(0);
  /** Seconds left, tagged with the attempt it belongs to (stale ticks are ignored). */
  const [tick, setTick] = useState({ attempt: 0, remaining: autoResolveDelay(0) });
  const controller = useRef(null);
  const endpoint = `/api/streams/${encodeURIComponent(matchId)}`;

  const check = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setChecking(true);
    let found = null;
    let stop = null;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 35_000);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: request.signal });
      const data = await response.json().catch(() => ({}));
      if (request.signal.aborted) return null;
      if (Number.isFinite(data.lockedCount)) setLockedCount(data.lockedCount);
      if (response.status === 404) stop = 'missing';
      else if (response.ok && Array.isArray(data.streams) && data.streams.length) found = data;
      else if (data?.matchStatus === 'finished') stop = 'finished';
    } catch {
      /* offline, timed out, or replaced by a newer check */
    } finally { clearTimeout(timeout); }
    if (request.signal.aborted && !timedOut) return null;
    setChecking(false);
    if (found) setResolved(found);
    else if (stop) setStopped(stop);
    else setAttempt((current) => current + 1);
    return found;
  }, [endpoint]);

  const onDue = useEffectEvent(() => { check(); });

  useEffect(() => {
    if (previousTier.current === access.tier) return;
    previousTier.current = access.tier;
    if (stopped) return undefined;
    const id = setTimeout(() => onDue(), 0);
    return () => clearTimeout(id);
  }, [access.tier, stopped]);

  // One countdown per attempt; like the player's watchdogs it only counts visible seconds.
  useEffect(() => {
    if (resolved || stopped || checking) return undefined;
    let remaining = autoResolveDelay(attempt);
    const id = setInterval(() => {
      if (document.hidden) return;
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(id);
        onDue();
        return;
      }
      setTick({ attempt, remaining });
    }, 1000);
    return () => clearInterval(id);
  }, [resolved, stopped, checking, attempt]);

  const remaining = tick.attempt === attempt ? tick.remaining : autoResolveDelay(attempt);

  useEffect(() => () => controller.current?.abort(), []);

  if (resolved) {
    return (
      <StreamPlayer
        matchId={matchId}
        streamUrl={resolved.defaultUrl}
        channels={resolved.streams}
        matchTitle={resolved.matchTitle || matchTitle}
        matchStatus={resolved.matchStatus || 'live'}
        // Retry rounds re-resolve the match; a failed refresh keeps the current list.
        onRefreshLinks={check}
      />
    );
  }

  const state = stopped || (lockedCount > 0 && access.tier === 'free' ? 'premium' : 'searching');
  const searching = state === 'searching' || state === 'premium';
  const { icon: Icon, title, body } = COPY[state];
  return (
    <div
      className="relative flex aspect-video items-center justify-center overflow-hidden rounded-3xl border border-navy-750 bg-navy-950 p-6 shadow-2xl"
      data-stream-resolver={state}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(204,255,0,0.10),transparent_62%)]" aria-hidden="true" />
      <div className="relative max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-lime-500/30 bg-lime-500/10">
          <Icon className={`h-5 w-5 text-lime-300 ${checking ? 'animate-pulse motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-xs text-zinc-300">{searching && initialReason ? `${initialReason} ${body}` : body}</p>
        </div>
        {searching && (
          <p
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1 text-[11px] font-bold text-lime-300"
            data-auto-resolve=""
          >
            <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            {checking ? 'Checking every backup feed…' : `Next check in ${remaining}s`}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {searching && (
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="tactile inline-flex cursor-pointer items-center gap-1.5 rounded-xl lime-cta px-3 py-1.5 text-[11px] font-bold disabled:opacity-60"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Check now
            </button>
          )}
          {state === 'finished' && (
            <Link href="/highlights" className="tactile inline-flex items-center gap-1.5 rounded-xl lime-cta px-3 py-1.5 text-[11px] font-bold">
              Watch highlights
            </Link>
          )}
          <Link
            href="/channels"
            className="tactile inline-flex items-center gap-1.5 rounded-xl border border-navy-750 px-3 py-1.5 text-[11px] font-bold text-zinc-300 transition-all hover:border-lime-500/40 hover:text-white"
          >
            Browse live channels
          </Link>
        </div>
        {state !== 'missing' && <p className="text-[10px] text-zinc-400">Scores, statistics and the play-by-play keep updating in the meantime.</p>}
      </div>
    </div>
  );
}
