'use client';

import { Fragment, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import AdSlot from '@/components/ads/AdSlot';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import HighlightCard from '@/components/HighlightCard';
import HighlightPlayerModal from '@/components/HighlightPlayerModal';

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-navy-750 bg-navy-900/60">
      <div className="aspect-video w-full animate-pulse bg-navy-850" />
      <div className="space-y-2.5 p-4">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-navy-850" />
        <div className="h-2.5 w-2/5 animate-pulse rounded bg-navy-850" />
      </div>
    </div>
  );
}

function NativeAdRow() {
  return (
    <div className="col-span-full flex w-full justify-center">
      <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
    </div>
  );
}

/**
 * The floating-card grid of YouTube match highlights.
 *
 * Cards hover-lift with a neon lime glow and open the seamless in-page
 * player (HighlightPlayerModal) — the user never leaves EVIV Live. A native
 * ad row is woven into the grid after every six cards, and one trailing row
 * keeps monetization stable whatever the count.
 */
export default function HighlightsGrid({ highlights = [], loading = false }) {
  const [active, setActive] = useState(null);
  const list = Array.isArray(highlights) ? highlights : [];

  return (
    <div className="w-full">
      {loading && list.length === 0 ? (
        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          data-highlights-grid="loading"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="w-full" data-highlights-grid="empty">
          <div className="rounded-3xl border border-navy-750 bg-navy-900/60 p-10 text-center">
            <Clapperboard className="mx-auto h-8 w-8 text-lime-500/70" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-zinc-200">No recent highlights</p>
            <p className="mt-1 text-xs text-zinc-400">
              Fresh goals and full match replays land here as soon as the big channels upload them.
            </p>
          </div>
          <div className="mt-5">
            <AdSlot variant="native" banner={AD_PLACEMENTS.highlightsNative} />
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          data-highlights-grid="ready"
        >
          {list.map((h, i) => (
            <Fragment key={h.id || i}>
              <HighlightCard highlight={h} featured={i === 0} onPlay={setActive} />
              {(i + 1) % 6 === 0 && <NativeAdRow />}
            </Fragment>
          ))}
          {list.length % 6 !== 0 && <NativeAdRow />}
        </div>
      )}

      <HighlightPlayerModal highlight={active} onClose={() => setActive(null)} />
    </div>
  );
}
