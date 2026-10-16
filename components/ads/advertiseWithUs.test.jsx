// @vitest-environment happy-dom
/**
 * "Advertise With Us": the banner's sparkling showcase, the onboarding modal and
 * the end of the `example.com` placeholder links.
 */
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
vi.mock('@/components/subscription/SubscriptionProvider', () => ({ useSubscription: () => subscription }));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

import TopSportsBanner from './TopSportsBanner';
import AdvertiseWithUsModal from './AdvertiseWithUsModal';
import { AD_PACKAGES, formatMad } from '@/lib/ads/enquiries';
import { ADVERTISE_CREATIVE, ADVERTISE_HREF, SPORTS_PARTNERS, advertiseHrefFor } from '@/lib/ads/partners';

let container;
let root;

beforeEach(() => {
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

const render = async (element) => {
  await act(async () => root.render(element));
};

describe('house creatives point at our own advertiser desk', () => {
  it('has no test-domain links left anywhere in the rotation', () => {
    for (const creative of SPORTS_PARTNERS) {
      expect(creative.href).not.toMatch(/example\.(com|org|net)/i);
      if (creative.network) expect(creative.href).toBe('');
      else expect(creative.href.startsWith('/')).toBe(true);
    }
    expect(ADVERTISE_HREF).toBe('/advertise');
    expect(advertiseHrefFor('atlas-boots')).toBe('/advertise?partner=atlas-boots');
  });

  it('closes the rotation with the "Advertise With Us" slide', () => {
    expect(SPORTS_PARTNERS[SPORTS_PARTNERS.length - 1].id).toBe(ADVERTISE_CREATIVE.id);
    expect(ADVERTISE_CREATIVE.advertise).toBe(true);
    expect(ADVERTISE_CREATIVE.cta).toBe('Advertise With Us');
    expect(SPORTS_PARTNERS.some((creative) => creative.network)).toBe(true);
  });

  it('sends a house CTA to /advertise and tracks the click', async () => {
    await render(<TopSportsBanner />);
    const cta = container.querySelector(`[data-banner-cta="${SPORTS_PARTNERS[0].id}"]`);
    expect(cta.getAttribute('href')).toBe(advertiseHrefFor(SPORTS_PARTNERS[0].id));
    expect(cta.getAttribute('target')).toBeNull();
    await act(async () => {
      cta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(trackClick).toHaveBeenCalledWith('top-rotating-banner', SPORTS_PARTNERS[0].id);
  });
});

describe('the banner opens the advertiser form in place', () => {
  it('opens the modal from the chrome button', async () => {
    await render(<TopSportsBanner />);
    expect(container.querySelector('[data-advertise-modal]')).toBeNull();
    const button = container.querySelector('[data-banner-advertise-button]');
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const modal = container.querySelector('[data-advertise-modal]');
    expect(modal).toBeTruthy();
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.textContent).toContain('Advertise With Us');
    expect(modal.textContent).toContain(formatMad(AD_PACKAGES[0].priceMinor));
  });

  it('opens the modal from the Advertise slide itself', async () => {
    vi.useFakeTimers();
    await render(<TopSportsBanner />);
    const dots = container.querySelectorAll('[aria-label^="Show slide"]');
    const advertiseIndex = SPORTS_PARTNERS.findIndex((creative) => creative.advertise);
    await act(async () => {
      dots[advertiseIndex].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const cta = container.querySelector(`[data-banner-cta="${ADVERTISE_CREATIVE.id}"]`);
    expect(cta).toBeTruthy();
    await act(async () => {
      cta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-advertise-modal]')).toBeTruthy();
    expect(trackClick).toHaveBeenCalledWith('top-rotating-banner', ADVERTISE_CREATIVE.id);
  });
});

describe('AdvertiseWithUsModal', () => {
  const submitEnquiry = (payload) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          enquiry: { reference: 'LL-ADS-7F3K', brand: payload.brand, packageId: payload.packageId },
          sla: { replyWithinHours: 24, contactEmail: 'ads@limon.live' },
        }),
      }))
    );
  };

  it('files the enquiry and shows the reference + price', async () => {
    submitEnquiry({ brand: 'Atlas Boots', packageId: 'pitch-side' });
    await render(<AdvertiseWithUsModal open onClose={() => {}} initialPartner="atlas-boots" />);
    expect(container.querySelector('[data-advertise-modal]')).toBeTruthy();

    const form = container.querySelector('form');
    const fill = (name, value) => {
      const field = form.querySelector(`[name="${name}"], [aria-label="${name}"]`) ?? [...form.querySelectorAll('input, textarea')].find((node) => node.placeholder && node.placeholder.toLowerCase().includes(name.toLowerCase()));
      return field;
    };
    // Brand is pre-filled from the deep-link partner id ("atlas-boots").
    expect(form.querySelector('input').value).toBe('Atlas Boots');

    const type = async (node, value) => {
      await act(async () => {
        node.value = value;
        node.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
    };
    const fields = [...form.querySelectorAll('input, textarea')].filter((node) => !node.readOnly && node.type !== 'radio');
    await type(fields[1], 'Nadia Benali');
    await type(fields[2], 'nadia@atlasboots.ma');
    await type(fields[fields.length - 1], 'Boot drop banner for the derby week, Arabic and French copy.');

    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    const success = container.querySelector('[data-advertise-success]');
    expect(success).toBeTruthy();
    expect(success.textContent).toContain('LL-ADS-7F3K');
    expect(success.textContent).toContain(formatMad(AD_PACKAGES[0].priceMinor));
    expect(fill('website')).toBeTruthy();
  });

  it('surfaces the API error and keeps the form on screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'A valid business email is required.' }) }))
    );
    await render(<AdvertiseWithUsModal open onClose={() => {}} />);
    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('valid business email');
    expect(container.querySelector('[data-advertise-success]')).toBeNull();
  });

  it('closes on Escape and renders nothing when closed', async () => {
    const onClose = vi.fn();
    await render(<AdvertiseWithUsModal open onClose={onClose} />);
    await act(async () => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
    await render(<AdvertiseWithUsModal open={false} onClose={onClose} />);
    expect(container.querySelector('[data-advertise-modal]')).toBeNull();
  });

  it('offers every rate-card placement with its price', async () => {
    await render(<AdvertiseWithUsModal open onClose={() => {}} />);
    for (const row of AD_PACKAGES) {
      const card = container.querySelector(`[data-ad-package="${row.id}"]`);
      expect(card).toBeTruthy();
      expect(card.textContent).toContain(row.name);
      expect(card.textContent).toContain(formatMad(row.priceMinor));
    }
  });
});
