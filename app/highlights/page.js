'use client';

import { Fragment, useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';
import AdSlot from '@/components/ads/AdSlot';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import { fetchHighlightsSafely } from '@/lib/utils/highlightsClient';

export default function HighlightsPage() {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Always resolves within 3s (empty list on timeout / error) — the page
    // never stays stuck on "Loading highlights…".
    fetchHighlightsSafely().then((list) => {
      if (cancelled) return;
      setHighlights(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-2 w-2 rounded-full bg-lime-500 live-dot" />
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Highlights &amp; Goals</h1>
      </div>
      <p className="text-sm text-zinc-400">Latest match highlights and goals from ScoreBat.</p>

      {loading && (
        <div className="flex items-center gap-2.5 text-zinc-500 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-500/20 border-t-lime-500" />
          Loading highlights…
        </div>
      )}

      {!loading && highlights.length === 0 && (
        <p className="text-zinc-500 text-sm">No recent highlights</p>
      )}

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {highlights.map((h, i) => (
          <Fragment key={h.id}>
            <button
              type="button"
              onClick={() => setActive(h)}
              className="group relative w-full overflow-hidden rounded-xl border border-navy-750 bg-navy-900 text-left shadow-md transition-all hover:border-lime-500/40"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {h.thumbnail ? (
                  <img src={h.thumbnail} alt={h.title} className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime-500 text-navy-950 shadow-[0_0_24px_rgba(198,255,0,0.5)] transition-transform group-hover:scale-110">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-white truncate">{h.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">{h.competition}{h.date ? ` · ${new Date(h.date).toLocaleDateString()}` : ''}</p>
              </div>
            </button>
            {/* Native banner inside the highlights grid */}
            {(i + 1) % 6 === 0 && (
              <div className="col-span-full flex w-full justify-center">
                <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
              </div>
            )}
          </Fragment>
        ))}
        {(highlights.length === 0 || highlights.length % 6 !== 0) && (
          <div className="col-span-full flex w-full justify-center">
            <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
          </div>
        )}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setActive(null)}>
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute -top-10 right-0 text-white hover:text-lime-400"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-navy-750 bg-black">
              {active.embed ? (
                <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: active.embed }} />
              ) : (
                <p className="flex h-full items-center justify-center text-zinc-400">No video available</p>
              )}
            </div>
            <p className="mt-3 text-sm font-bold text-white">{active.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
