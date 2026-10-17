'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import { buildTickerItems } from '@/lib/ticker/tickerItems';

/**
 * Live sports ticker (Phase 5). Items come ONLY from the verified match
 * pipeline (/api/matches → buildTickerItems): live scores, finals <24h,
 * today's fixtures. No invented headlines. The strip has a fixed height so
 * data arrival never shifts the page; when there is nothing verified to
 * show it says so instead of vanishing.
 */
const REFRESH_MS = 60_000;

export default function SportsTicker() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/matches', { cache: 'no-store' });
      if (!response.ok) return; // keep last verified items on transient failure
      const payload = await response.json().catch(() => null);
      setItems(buildTickerItems(payload?.matches || []));
      setLoaded(true);
    } catch {
      // keep last-good items
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const id = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const hasLive = items.some((item) => item.kind === 'live');
  const loop = items.length > 1;

  return (
    <div data-sports-ticker className="w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]" role="region" aria-label="Live sports ticker">
      <div className="mx-auto flex h-9 w-full max-w-[var(--lyt-width,1320px)] items-center gap-2 px-3 sm:px-6">
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-[800] uppercase tracking-widest ${hasLive ? 'bg-[var(--color-live)] text-[var(--live-on,#0B1A0A)]' : 'bg-[var(--color-surface-3,#1a2a16)] text-[var(--color-muted,#a3bfa0)]'}`}>
          <span aria-hidden="true" className={`size-1.5 rounded-full bg-current ${hasLive ? 'animate-pulse' : ''}`} />
          Scores
        </span>

        <div className="group relative min-w-0 flex-1 overflow-hidden" data-ticker-viewport>
          {!loaded ? (
            <p className="truncate text-xs text-[var(--color-muted,#a3bfa0)]" aria-live="polite">Loading verified scores…</p>
          ) : items.length === 0 ? (
            <p data-ticker-empty className="truncate text-xs text-[var(--color-muted,#a3bfa0)]">No verified live scores or results to show right now.</p>
          ) : (
            <div
              data-ticker-track
              className={`flex w-max items-center gap-8 whitespace-nowrap motion-safe:[animation:tickerScroll_45s_linear_infinite] group-hover:[animation-play-state:paused] ${paused ? '[animation-play-state:paused]' : ''}`}
            >
              {(loop ? [...items, ...items] : items).map((item, index) => (
                <Link
                  key={`${item.id}-${index}`}
                  href={item.href}
                  aria-hidden={index >= items.length ? 'true' : undefined}
                  tabIndex={index >= items.length ? -1 : 0}
                  className={`text-xs font-[600] hover:text-[var(--color-lime,#B7E41E)] ${item.kind === 'live' ? 'text-[var(--color-text,#E9F6E4)]' : 'text-[var(--color-muted,#a3bfa0)]'}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Resume ticker' : 'Pause ticker'}
            aria-pressed={paused}
            className="shrink-0 rounded-md p-1 text-[var(--color-muted,#a3bfa0)] hover:text-[var(--color-text,#E9F6E4)]"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
