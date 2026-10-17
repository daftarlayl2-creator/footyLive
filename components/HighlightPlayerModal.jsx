'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ExternalLink, Eye, Tv, X } from 'lucide-react';
import { stripIframeSandbox } from '@/lib/player/embed';
import SafeExternalLink from '@/components/ui/ExternalLink';

function relativeTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatViews(views) {
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(views);
  } catch {
    return String(views);
  }
}

/**
 * The Limon Live highlight player.
 *
 * Clicking a highlight card never leaves the site: the video plays inside
 * this sleek modal on a clean YouTube embed (`?rel=0&modestbranding=1` strips
 * the branding clutter) wrapped in a neon lime frame so the player feels
 * native to the burgundy theme. Closes on ESC, backdrop click or the close
 * button; body scrolling is locked while it is open.
 */
export default function HighlightPlayerModal({ highlight, onClose }) {
  const closeRef = useRef(null);
  // Phase 8: embed failure detection. A disabled/blocked embed strands the
  // viewer on YouTube's error screen with no signal we can read cross-origin,
  // so we watch the frame's own load/error events and a patience deadline —
  // then surface the authorized fallback (the official watch page). We never
  // proxy or re-host the video.
  // State is keyed by video id so switching highlights needs no reset effect.
  const [player, setPlayer] = useState({ id: null, ready: false, failed: false, slow: false });
  const videoIdForState = highlight?.videoId;
  useEffect(() => {
    if (!videoIdForState) return undefined;
    const timer = setTimeout(() => {
      // The deadline belongs to THIS video (the effect re-runs per id). If no
      // load/error has claimed the state yet, the player id is still null or
      // the previous video's — that is precisely the slow case, so claim the
      // state as slow for the current video instead of ignoring the deadline.
      setPlayer((prev) => {
        if (prev.id === videoIdForState) return prev.ready ? prev : { ...prev, slow: true };
        return { id: videoIdForState, ready: false, failed: false, slow: true };
      });
    }, 6000);
    return () => clearTimeout(timer);
  }, [videoIdForState]);
  const playerReady = player.id === videoIdForState && player.ready;
  const playerFailed = player.id === videoIdForState && player.failed;
  const playerSlow = player.id === videoIdForState && player.slow;

  useEffect(() => {
    if (!highlight) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus?.();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [highlight, onClose]);

  if (!highlight) return null;

  const { videoId } = highlight;
  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1&autoplay=1`
    : '';
  const when = relativeTime(highlight.date);
  const views =
    typeof highlight.views === 'number' && highlight.views > 0 ? formatViews(highlight.views) : '';

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/90 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Highlight player: ${highlight.title || 'match highlights'}`}
      onClick={onClose}
    >
      <div
        className="animate-scale-up relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold leading-snug text-white sm:text-lg">
              {highlight.title || highlight.matchTitle || 'Match highlights'}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-zinc-400">
              {highlight.competition && (
                <span className="text-lime-400">{highlight.competition}</span>
              )}
              {highlight.channel && (
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <Tv className="h-3 w-3 shrink-0 text-lime-500/80" aria-hidden="true" />
                  {highlight.channel}
                </span>
              )}
              {when && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-lime-500/80" aria-hidden="true" />
                  {when}
                </span>
              )}
              {views && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3 text-lime-500/80" aria-hidden="true" />
                  {views}
                </span>
              )}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-navy-750 bg-navy-900/90 text-zinc-300 transition-all hover:border-lime-500/60 hover:text-lime-400 hover:shadow-[0_0_15px_rgba(198,255,0,0.35)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Neon lime framed player — the native Limon Live video surface */}
        <div className="overflow-hidden rounded-2xl border-2 border-lime-500 bg-black shadow-[0_0_40px_rgba(198,255,0,0.35)]">
          <div className="aspect-video w-full">
            {embedSrc ? (
              <iframe
                key={videoId}
                src={embedSrc}
                title={highlight.title || 'YouTube highlight player'}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setPlayer((prev) => ({ id: videoId, ready: true, failed: prev.id === videoId ? prev.failed : false, slow: false }))}
                onError={() => setPlayer((prev) => ({ id: videoId, ready: prev.id === videoId ? prev.ready : false, failed: true, slow: prev.id === videoId ? prev.slow : false }))}
                allowFullScreen
              />
            ) : highlight.embed ? (
              // Legacy providers without a video id still work via raw embed code. Any
              // `sandbox` in that markup is stripped: provider players refuse to run sandboxed.
              <div className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" dangerouslySetInnerHTML={{ __html: stripIframeSandbox(highlight.embed) }} />
            ) : (
              <p className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                No video available
              </p>
            )}
          </div>
        </div>

        {/* Authorized fallback when the embed fails or never becomes ready
            (region/embedding restrictions show inside the frame itself): we
            point to the official watch page instead of proxying anything. */}
        {embedSrc && (playerFailed || (!playerReady && playerSlow)) ? (
          <p data-highlight-fallback className="mt-3 rounded-xl border border-navy-750 bg-navy-900/80 px-3 py-2 text-center text-xs text-zinc-300" role="status">
            {playerFailed ? 'The embedded player could not load.' : 'The player is taking a while — the video may be restricted in your region.'}{' '}
            {highlight.url ? (
              <SafeExternalLink href={highlight.url} fallbackLabel="YouTube link unavailable" className="font-bold text-lime-400 hover:underline">
                Watch it on YouTube
              </SafeExternalLink>
            ) : null}
          </p>
        ) : null}

        {/* Footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
          <p className="min-w-0">
            Playing inside Limon Live — the stream comes straight from YouTube&rsquo;s official player.
          </p>
          {highlight.url && (
            <SafeExternalLink
              href={highlight.url}
              fallbackLabel="YouTube link unavailable"
              className="inline-flex shrink-0 items-center gap-1 font-bold text-zinc-400 transition-colors hover:text-lime-400"
            >
              Open on YouTube
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </SafeExternalLink>
          )}
        </div>
      </div>
    </div>
  );
}
