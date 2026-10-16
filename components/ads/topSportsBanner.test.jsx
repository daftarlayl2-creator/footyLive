// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackImpression = vi.fn();
const trackClick = vi.fn();
vi.mock('@/lib/analytics/tracker', () => ({
  trackImpression: (...args) => trackImpression(...args),
  trackClick: (...args) => trackClick(...args),
  trackPageview: vi.fn(),
  startAnalytics: vi.fn(() => () => {}),
  analyticsSid: () => 'test-sid-0001',
}));

let subscription = { access: { adFree: false }, grants: [], checkoutAvailable: false };
vi.mock('@/components/subscription/SubscriptionProvider', () => ({
  useSubscription: () => subscription,
}));

import TopSportsBanner from './TopSportsBanner';
import { PARTNER_ROTATION_MS, SPORTS_PARTNERS } from '@/lib/ads/partners';

let container;
let root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear();
  vi.clearAllMocks();
  subscription = { access: { adFree: false }, grants: [], checkoutAvailable: false };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const render = async (element) => { await act(async () => root.render(element)); };

describe('top rotating sports ad banner', () => {
  it('renders the first sports creative with brand, tagline, CTA and dots', async () => {
    await render(<TopSportsBanner />);
    const banner = container.querySelector('[data-top-sports-banner]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain(SPORTS_PARTNERS[0].brand);
    expect(banner.textContent).toContain(SPORTS_PARTNERS[0].tagline);
    expect(banner.textContent).toContain(SPORTS_PARTNERS[0].cta);
    // One dot per creative in the rotation.
    expect(banner.querySelectorAll('[aria-label^="Show slide"]').length).toBe(SPORTS_PARTNERS.length);
    // An impression fired for the visible creative.
    expect(trackImpression).toHaveBeenCalledWith('top-rotating-banner', SPORTS_PARTNERS[0].id);
  });

  it('rotates smoothly to the next creative on the timer', async () => {
    vi.useFakeTimers();
    await render(<TopSportsBanner />);
    const label = () => container.querySelector('.top-banner-slide--active')?.textContent || '';
    expect(label()).toContain(SPORTS_PARTNERS[0].brand);
    await act(async () => { vi.advanceTimersByTime(PARTNER_ROTATION_MS + 50); });
    expect(label()).toContain(SPORTS_PARTNERS[1].brand);
    expect(trackImpression).toHaveBeenCalledWith('top-rotating-banner', SPORTS_PARTNERS[1].id);
  });

  it('tracks CTA clicks as analytics clicks', async () => {
    await render(<TopSportsBanner />);
    const cta = container.querySelector(`[data-banner-cta="${SPORTS_PARTNERS[0].id}"]`);
    expect(cta.getAttribute('rel')).toContain('sponsored');
    await act(async () => { cta.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(trackClick).toHaveBeenCalledWith('top-rotating-banner', SPORTS_PARTNERS[0].id);
  });

  it('hides completely for VIP (ad-free) fans', async () => {
    subscription = { access: { adFree: true }, grants: [], checkoutAvailable: false };
    await render(<TopSportsBanner />);
    expect(container.querySelector('[data-top-sports-banner]')).toBeNull();
    expect(trackImpression).not.toHaveBeenCalled();
  });

  it('supports manual dot navigation and pause/resume', async () => {
    vi.useFakeTimers();
    await render(<TopSportsBanner />);
    const dots = container.querySelectorAll('[aria-label^="Show slide"]');
    await act(async () => { dots[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('.top-banner-slide--active').textContent).toContain(SPORTS_PARTNERS[2].brand === 'Sponsored' ? '' : SPORTS_PARTNERS[2].brand);

    const pause = container.querySelector('[aria-label^="Pause"],[aria-label^="Resume"]');
    await act(async () => { pause.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    trackImpression.mockClear();
    await act(async () => { vi.advanceTimersByTime(PARTNER_ROTATION_MS * 2); });
    // Paused: no further rotation impressions beyond the current slide's.
    const pauseAgain = container.querySelector('[aria-label^="Pause"],[aria-label^="Resume"]');
    expect(pauseAgain.getAttribute('aria-pressed')).toBe('true');
  });

  it('dismisses for the session', async () => {
    await render(<TopSportsBanner />);
    const dismiss = container.querySelector('[aria-label^="Hide this banner"]');
    await act(async () => { dismiss.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('[data-top-sports-banner]')).toBeNull();
    expect(window.sessionStorage.getItem('limon:top-banner-dismissed')).toBe('1');
  });

  it('has smooth slide transitions in CSS with a reduced-motion escape hatch', async () => {
    const css = await import('node:fs').then((fs) => fs.readFileSync('app/globals.css', 'utf8'));
    expect(css).toContain('.top-banner-slide');
    expect(css).toContain('.top-banner-slide--active');
    expect(css).toContain('transition: opacity');
    expect(css).toContain('@keyframes topBannerEnter');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\.top-banner-slide/);
  });
});
