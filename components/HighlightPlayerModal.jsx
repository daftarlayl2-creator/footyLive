'use client';

import { useEffect, useRef } from 'react';
import { CalendarDays, ExternalLink, Eye, Tv, X } from 'lucide-react';
import { stripIframeSandbox } from '@/lib/player/embed';

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

        {/* Footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
          <p className="min-w-0">
            Playing inside Limon Live — the stream comes straight from YouTube&rsquo;s official player.
          </p>
          {highlight.url && (
            <a
              href={highlight.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-bold text-zinc-400 transition-colors hover:text-lime-400"
            >
              Open on YouTube
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
