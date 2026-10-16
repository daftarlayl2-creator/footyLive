'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRight, Megaphone, Pause, Play, X } from 'lucide-react';
import { PARTNER_ROTATION_MS, SPORTS_PARTNERS } from '@/lib/ads/partners';
import { AD_PLACEMENTS } from '@/lib/adsConfig';
import AdSlot from '@/components/ads/AdSlot';
import { useSubscription } from '@/components/subscription/SubscriptionProvider';
import { trackClick, trackImpression } from '@/lib/analytics/tracker';

const DISMISS_KEY = 'limon:top-banner-dismissed';
const emptySubscribe = () => () => {};

/** Tiny inline pictograms — pure SVG, tinted by the creative's accent. */
function PartnerIcon({ icon, accent }) {
  const common = { fill: 'none', stroke: accent, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true">
      {icon === 'boot' && <g {...common}><path d="M3 16l4-1 4-7 2 2 3-1-1 5 4 2v2H3z" /><path d="M9 15l.9 1M13 15l.9 1" /></g>}
      {icon === 'bottle' && <g {...common}><rect x="9" y="6" width="6" height="13" rx="2.5" /><path d="M10.5 6V4h3v2M9.5 11h5" /></g>}
      {icon === 'jersey' && <g {...common}><path d="M9 4l3 2 3-2 4 3-2 3-2-1v11H9V9l-2 1-2-3z" /></g>}
      {icon === 'whistle' && <g {...common}><path d="M10 10h6l4-2v5h-6" /><circle cx="8.5" cy="13.5" r="4" /><circle cx="8.5" cy="13.5" r="1" fill={accent} stroke="none" /></g>}
      {icon === 'trophy' && <g {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v2M9 19h6M10 15h4l.7 4H9.3z" /></g>}
      {icon === 'ball' && <g {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5l2.8 2.05-1.07 3.3h-3.46l-1.07-3.3zM12 3.5v4M20 9.5l-2.2.05M4 9.5l2.2.05M7 19l1.4-1.65M17 19l-1.4-1.65" /></g>}
    </svg>
  );
}

/**
 * Sticky top rotating sports ad banner for the home feed.
 *
 * Cycles through sports-themed partner creatives (pure CSS/SVG art) with the
 * Adsterra leaderboard rotating in as one of the slides, so the banner always
 * has something on air. Smooth crossfade + slide, pauses on hover, dots for
 * manual navigation, dismissible per tab session, hidden for VIP (ad-free)
 * fans, and motion-safe for reduced-motion users.
 */
const readDismissed = () => {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

export default function TopSportsBanner() {
  const { access } = useSubscription();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  // Session-stored dismissal (server always renders "not dismissed" → stable SSR),
  // plus a local override so dismissing hides instantly without a reload.
  const storedDismissed = useSyncExternalStore(emptySubscribe, readDismissed, () => false);
  const [dismissedNow, setDismissedNow] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const impressionFor = useRef(null);
  const creatives = SPORTS_PARTNERS;
  const dismissed = dismissedNow || storedDismissed;

  // Rotation engine: advance every PARTNER_ROTATION_MS unless paused/hidden.
  useEffect(() => {
    if (!mounted || dismissed || paused || access.adFree) return undefined;
    if (document.hidden) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % creatives.length), PARTNER_ROTATION_MS);
    return () => clearInterval(timer);
  }, [mounted, dismissed, paused, access.adFree, creatives.length]);

  const active = creatives[index % creatives.length];

  // One impression per creative activation (unique per mount+slide).
  useEffect(() => {
    if (!mounted || dismissed || access.adFree || !active) return;
    const key = `${active.id}:${index}`;
    if (impressionFor.current === key) return;
    impressionFor.current = key;
    trackImpression('top-rotating-banner', active.id);
  }, [mounted, dismissed, access.adFree, active, index]);

  if (access.adFree || (mounted && dismissed)) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage full — hide for this render only */
    }
    setDismissedNow(true);
  };

  return (
    <div
      className="sticky top-2 z-30 w-full"
      data-top-sports-banner=""
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="top-banner-frame relative mx-auto flex min-h-[64px] w-full items-stretch overflow-hidden rounded-2xl border border-white/12 bg-[#18030A]/95 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-eviv-lime" aria-hidden="true" />
        <span className="pointer-events-none absolute -left-10 top-0 h-full w-24 bg-eviv-lime/10 blur-2xl" aria-hidden="true" />

        {/* Slides */}
        <div className="relative min-w-0 flex-1" role="region" aria-roledescription="carousel" aria-label="Sponsored sports picks">
          {creatives.map((creative, slideIndex) => {
            const isActive = slideIndex === index % creatives.length;
            const hidden = !isActive;
            if (creative.network) {
              // The Adsterra network slide: a real leaderboard inside the rotation.
              return (
                <div
                  key={creative.id}
                  aria-hidden={hidden}
                  className={`top-banner-slide absolute inset-0 flex items-center justify-center px-3 ${isActive ? 'top-banner-slide--active' : ''}`}
                  style={{ pointerEvents: hidden ? 'none' : 'auto' }}
                >
                  {isActive && (
                    <div className="flex w-full items-center justify-center py-2">
                      <div className="hidden md:block">
                        <AdSlot variant="banner" banner={AD_PLACEMENTS.watchTopBanner} label="Sponsored" />
                      </div>
                      <div className="md:hidden">
                        <AdSlot variant="banner" banner={AD_PLACEMENTS.homeTopMobile} label="Sponsored" />
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div
                key={creative.id}
                aria-hidden={hidden}
                className={`top-banner-slide absolute inset-0 flex items-center gap-3 px-4 py-2.5 sm:gap-4 ${isActive ? 'top-banner-slide--active' : ''}`}
                style={{ pointerEvents: hidden ? 'none' : 'auto', '--accent': creative.accent, '--accent-deep': creative.deep }}
              >
                <span
                  className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border sm:flex"
                  style={{ borderColor: `${creative.accent}55`, background: `linear-gradient(140deg, ${creative.accent}22, ${creative.deep})` }}
                >
                  <PartnerIcon icon={creative.icon} accent={creative.accent} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: creative.accent }}>
                    <Megaphone className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {creative.brand}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-bold text-white sm:text-sm">{creative.tagline}</p>
                </div>
                <a
                  href={creative.href}
                  target="_blank"
                  rel="noopener sponsored nofollow"
                  tabIndex={hidden ? -1 : 0}
                  onClick={() => trackClick('top-rotating-banner', creative.id)}
                  className="top-banner-cta inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide sm:px-3.5 sm:text-[11px]"
                  style={{ background: creative.accent, color: '#18030A' }}
                  data-banner-cta={creative.id}
                >
                  {creative.cta}
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            );
          })}

          {/* Invisible height donor: the frame is sized to fit the leaderboard
              slide (728x90 on desktop, 320x50 on mobile) plus its padding. */}
          <div className="invisible flex min-h-[66px] items-center gap-3 px-4 py-2.5 sm:gap-4 md:min-h-[96px]" aria-hidden="true">
            <span className="hidden h-10 w-10 shrink-0 sm:block" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em]">Limon partners</p>
              <p className="mt-0.5 text-xs font-bold sm:text-sm">Half-time? Grab tonight’s fastest football gear.</p>
            </div>
          </div>
        </div>

        {/* Controls: pause/play, dots, dismiss */}
        <div className="flex shrink-0 flex-col items-end justify-between gap-1 py-1.5 pl-1 pr-2">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide this banner for this session"
            className="tactile rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? 'Resume the rotating ads' : 'Pause the rotating ads'}
              aria-pressed={paused}
              className="tactile rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              {paused ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
            </button>
            <div className="flex items-center gap-1" aria-label="Banner slides">
              {creatives.map((creative, dotIndex) => (
                <button
                  key={creative.id}
                  type="button"
                  aria-current={dotIndex === index % creatives.length}
                  aria-label={`Show slide ${dotIndex + 1}: ${creative.brand}`}
                  onClick={() => setIndex(dotIndex)}
                  className={`top-banner-dot h-1.5 rounded-full transition-all duration-300 ${dotIndex === index % creatives.length ? 'w-3.5 bg-eviv-lime' : 'w-1.5 bg-white/25 hover:bg-white/50'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
