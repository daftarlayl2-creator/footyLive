'use client';

import { useEffect, useState } from 'react';
import HighlightsGrid from '@/components/HighlightsGrid';
import { fetchHighlightsSafely } from '@/lib/utils/highlightsClient';

export default function HighlightsPage() {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Always resolves within 3s (empty list on timeout / error) — the page
    // never stays stuck on the loading skeletons.
    fetchHighlightsSafely().then((list) => {
      if (cancelled) return;
      setHighlights(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-2 w-2 rounded-full bg-lime-500 live-dot" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Highlights &amp; Goals</h1>
        </div>
        <p className="max-w-2xl text-sm text-zinc-400">
          The latest football highlights from the world&rsquo;s biggest leagues and broadcasters.
          Tap any card to watch right here on EVIV Live — no detour to YouTube.
        </p>
      </div>

      <HighlightsGrid highlights={highlights} loading={loading} />
    </div>
  );
}
