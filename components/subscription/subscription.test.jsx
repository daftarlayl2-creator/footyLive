// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionProvider, { useSubscription } from './SubscriptionProvider';
import PremiumButton from './PremiumButton';
import PricingPlans from './PricingPlans';
import SubscriptionStatus from './SubscriptionStatus';
import StreamPlayer from '@/components/StreamPlayer';
import { buildProxyUrl } from '@/lib/hlsProxy';
import AdFreeBoundary from './AdFreeBoundary';
import AdSlot from '@/components/ads/AdSlot';
import MultiStreamPage from '@/app/multistream/page';
import VerifiedBadge from '@/components/auth/VerifiedBadge';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/player/loadHls', () => ({ loadHls: async () => ({ isSupported: () => false }) }));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const grant = (expiresAt = Date.now() + 60_000) => ({ id: 'settled-1', planId: 'monthly', startsAt: Date.now() - 1000, expiresAt });
const snapshot = (grants = [], checkoutAvailable = false) => ({ grants, checkoutAvailable, unavailable: false });
let container; let root; let fetcher;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Never execute third-party advertising in a unit test, including srcdoc frames.
  window.happyDOM.settings.disableJavaScriptFileLoading = true;
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  window.localStorage.clear();
  window.happyDOM.setURL('https://footy.example/multistream');
  vi.useFakeTimers();
  fetcher = vi.fn(async () => json({ grants: [], checkoutAvailable: false })); vi.stubGlobal('fetch', fetcher);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };
const click = async (element) => { await act(async () => element.click()); };
const tick = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function AccessObserver() {
  const { access, unavailable } = useSubscription('espn-1');
  return <span data-access={access.tier} data-ads={String(access.adFree)} data-unavailable={String(unavailable)} />;
}

describe('VIP paywall and ad lifecycle', () => {
  it('never mounts any ad container, dock, iframe or script for server-seeded VIP', () => {
    const html = renderToStaticMarkup(<SubscriptionProvider initial={snapshot([grant()])}>
      <AdSlot variant="banner" /><AdSlot variant="native" /><AdSlot variant="social" />
      <AdFreeBoundary><div data-ad-dock="" /></AdFreeBoundary>
    </SubscriptionProvider>);
    expect(html).not.toContain('data-ad'); expect(html).not.toContain('iframe'); expect(html).not.toContain('script');
  });
  it('fully tears down ad documents when a pass activates, including the social script frame', async () => {
    fetcher.mockResolvedValue(json({ grants: [grant()], checkoutAvailable: true }));
    await render(<SubscriptionProvider initial={snapshot()}>
      <AdSlot variant="banner" /><AdSlot variant="social" /><AccessObserver />
    </SubscriptionProvider>);
    expect(container.querySelectorAll('[data-ad-slot]')).toHaveLength(0);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[data-access]').getAttribute('data-access')).toBe('vip');
    expect(document.documentElement.dataset.vipAdFree).toBe('true');
  });
  it('expires client feature gates at the exact receipt boundary even when revalidation is down', async () => {
    fetcher.mockRejectedValue(new Error('network unavailable'));
    await render(<SubscriptionProvider initial={snapshot([grant(Date.now() + 1000)], true)}><AccessObserver /></SubscriptionProvider>);
    expect(container.querySelector('[data-access]').getAttribute('data-access')).toBe('vip');
    await tick(1002);
    expect(container.querySelector('[data-access]').getAttribute('data-access')).toBe('free');
    expect(container.querySelector('[data-access]').getAttribute('data-ads')).toBe('false');
    expect(container.querySelector('[data-access]').getAttribute('data-unavailable')).toBe('true');
  });
  it('renews VIP bearer links before their security expiry rather than imposing a viewing timeout', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    const paid = grant(Date.now() + 180_000);
    const url = buildProxyUrl('https://cdn.example/live.m3u8', { maxHeight: 2160, expiresAt: Date.now() + 65_000 });
    fetcher.mockImplementation(async (path) => String(path).includes('stream-health') ? json({ health: {} }) : json({ grants: [paid], checkoutAvailable: true }));
    await render(<SubscriptionProvider initial={snapshot([paid], true)}><StreamPlayer matchId="espn-1" channels={[{ name: 'Live FHD', url, quality: 'FHD' }]} matchStatus="live" /></SubscriptionProvider>);
    expect(router.refresh).not.toHaveBeenCalled();
    await tick(5_001);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('does not unlock the arena from a local VIP flag or a fake checkout-success query', async () => {
    window.localStorage.setItem('vip', 'true');
    window.happyDOM.setURL('https://footy.example/multistream?checkout=success');
    await render(<><MultiStreamPage /><SubscriptionStatus checkoutState="success" /></>);
    expect(container.textContent).toContain('Waiting for verified payment confirmation');
    expect(container.querySelector('[data-multiview-locked]')).not.toBeNull();
    expect(container.querySelector('[data-multiview-arena]')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('opens a glass dialog with all four prices, traps focus, and returns focus on Escape', async () => {
    await render(<PremiumButton matchId="espn-1" />);
    const trigger = container.querySelector('button'); trigger.focus();
    await click(trigger);
    const modal = document.querySelector('[role="dialog"]');
    expect(modal.className).toContain('vip-glass'); expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.querySelectorAll('[data-plan]')).toHaveLength(4);
    for (const price of [3, 15, 40, 150]) expect(modal.querySelector(`[aria-label*="for ${price} MAD"]`)).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    const first = modal.querySelector('button');
    expect(document.activeElement).toBe(first);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })));
    expect(document.activeElement.textContent).toBe('Continue with free HD');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe('');
  });
  it('requires a fixture for the single pass and explains unconfigured checkout honestly', async () => {
    await render(<PricingPlans />);
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain('Select this pass from a live or upcoming match page');
    expect(container.textContent).toContain('no payment will be taken');
  });
  it('keeps the paywall open on checkout failure, without granting VIP, and prevents duplicate submissions', async () => {
    let finish;
    fetcher.mockImplementation(async (url) => url === '/api/subscription' ? json({ grants: [], checkoutAvailable: true }) : new Promise((resolve) => { finish = resolve; }));
    await render(<SubscriptionProvider initial={snapshot([], true)}><PricingPlans matchId="espn-1" /><AccessObserver /></SubscriptionProvider>);
    const button = container.querySelector('[data-plan="monthly"] button');
    await click(button); await click(button);
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/subscription/checkout')).toHaveLength(1);
    expect(button.disabled).toBe(true);
    await act(async () => finish(json({ error: 'Payment service unavailable. No payment taken.' }, 503)));
    expect(container.querySelector('[role="alert"]').textContent).toContain('No payment taken');
    expect(container.querySelector('[data-access]').getAttribute('data-access')).toBe('free');
    expect(button.disabled).toBe(false);
  });
  it('bounds verified badge sizes and retains the fixed lime/burgundy geometry for invalid props', () => {
    const html = renderToStaticMarkup(<><VerifiedBadge size={Infinity} /><VerifiedBadge size={-20} /><VerifiedBadge size={99999} /></>);
    expect(html).toContain('--vb-size:16px'); expect(html).toContain('--vb-size:8px'); expect(html).toContain('--vb-size:96px');
    expect(html).toContain('#CCFF00'); expect(html).toContain('#2A0813');
    expect(html).not.toContain('Infinity');
  });
});
