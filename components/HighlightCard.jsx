'use client';

import { useState } from 'react';
import { Eye, Play } from 'lucide-react';

/**
 * ytimg thumbnail ladder, highest resolution first. `maxresdefault` does not
 * exist for every upload, so the <img> falls back down the ladder on error —
 * a card never renders an empty grey box.
 */
const THUMB_STEPS = ['maxresdefault', 'hqdefault', 'mqdefault'];

function HighlightThumb({ highlight }) {
  const [step, setStep] = useState(0);
  const videoId = highlight?.videoId;
  const src = videoId
    ? `https://i.ytimg.com/vi/${videoId}/${THUMB_STEPS[Math.min(step, THUMB_STEPS.length - 1)]}.jpg`
    : highlight?.thumbnail || '';
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setStep((s) => s + 1)}
      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
    />
  );
}

function formatViews(views) {
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(views);
  } catch {
    return String(views);
  }
}

/** Compact relative date ("2h ago") that degrades to a locale date. */
function relativeTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const minutes = Math.round((Date.now() - t) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return '';
  }
}

/**
 * One floating highlight card. The card lifts on hover (`-translate-y-2`),
 * catches a neon lime glow, the thumbnail zooms and the lime play button
 * (pulsing via the shared `live-dot` keyframe) invites the tap — which opens
 * the in-page player, never a redirect to YouTube.
 */
export default function HighlightCard({ highlight, onPlay, featured = false, className = '' }) {
  if (!highlight) return null;

  const when = relativeTime(highlight.date);
  const views =
    typeof highlight.views === 'number' && highlight.views > 0 ? formatViews(highlight.views) : '';

  return (
    <article
      data-highlight-id={highlight.id}
      className={`tactile-soft group relative flex flex-col overflow-hidden rounded-3xl border border-navy-750 bg-navy-900/80 shadow-md backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-2 hover:border-lime-500/60 hover:shadow-[0_0_15px_#C6FF00] ${featured ? 'sm:col-span-2' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onPlay?.(highlight)}
        className="relative block w-full cursor-pointer text-left"
        aria-label={`Play highlights: ${highlight.title || highlight.matchTitle || 'match video'}`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-navy-950">
          <HighlightThumb highlight={highlight} />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/10 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="live-dot flex h-12 w-12 items-center justify-center rounded-full bg-lime-500 text-navy-950 shadow-[0_0_28px_rgba(198,255,0,0.6)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-lime-400 sm:h-14 sm:w-14">
              <Play className="ml-0.5 h-5 w-5 fill-current sm:h-6 sm:w-6" aria-hidden="true" />
            </span>
          </span>
          {views && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-navy-950/80 px-2 py-0.5 text-[10px] font-bold text-zinc-300 backdrop-blur-sm">
              <Eye className="h-3 w-3" aria-hidden="true" />
              {views}
            </span>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-zinc-100 transition-colors duration-300 group-hover:text-lime-400">
          {highlight.title || highlight.matchTitle || 'Match highlights'}
        </h3>
        <p className="mt-auto flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold text-zinc-400">
          {highlight.competition && (
            <span className="shrink-0 text-lime-500/90">{highlight.competition}</span>
          )}
          {highlight.competition && when && <span aria-hidden="true">·</span>}
          {when && <span className="truncate">{when}</span>}
        </p>
      </div>

      {/* Hover sheen: a soft lime wash sweeping the card top */}
      <span className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(120%_90%_at_50%_0%,rgba(198,255,0,0.08),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </article>
  );
}
