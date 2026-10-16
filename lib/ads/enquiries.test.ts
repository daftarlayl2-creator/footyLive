/**
 * The advertiser desk: rate card, lead validation, references and the pipeline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/cacheManager', () => {
  const store = new Map<string, unknown>();
  return {
    getCacheManager: () => ({
      get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
      set: async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
      },
    }),
    __resetStore: () => store.clear(),
  };
});
import * as cacheManagerMock from '@/lib/cache/cacheManager';
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  AD_PACKAGES,
  findAdPackage,
  formatMad,
  isBusinessEmail,
  listEnquiries,
  resetAdEnquiryMemory,
  submitEnquiry,
  updateEnquiry,
} from './enquiries';

const __resetStore = (cacheManagerMock as unknown as { __resetStore: () => void }).__resetStore;
const NOW = Date.parse('2026-10-16T16:00:00Z');

const VALID = {
  brand: 'Atlas Boots',
  contact: 'Nadia Benali',
  email: 'nadia@atlasboots.ma',
  packageId: 'pitch-side',
  budget: '3,000 MAD',
  message: 'New boot drop for the derby, banner + Arabic copy please.',
  partner: 'atlas-boots',
};

beforeEach(() => {
  __resetStore();
  resetAdEnquiryMemory();
});

describe('rate card', () => {
  it('prices every placement positively and in MAD minor units', () => {
    expect(AD_PACKAGES.length).toBeGreaterThanOrEqual(4);
    for (const row of AD_PACKAGES) {
      expect(row.priceMinor).toBeGreaterThan(0);
      expect(row.name).toBeTruthy();
      expect(row.nameAr).toBeTruthy();
      expect(row.placement).toBeTruthy();
      expect(formatMad(row.priceMinor)).toMatch(/MAD$/);
    }
    expect(findAdPackage('pitch-side')?.featured).toBe(true);
    expect(findAdPackage('made-up')).toBeUndefined();
  });

  it('formats prices without decimals for the rate card', () => {
    expect(formatMad(180_000)).toBe('1,800 MAD');
    expect(formatMad(0)).toBe('0 MAD');
    expect(formatMad(-5)).toBe('0 MAD');
  });

  it('accepts business-shaped emails and refuses the rest', () => {
    expect(isBusinessEmail('ads@limon.live')).toBe(true);
    expect(isBusinessEmail('n.benali+ads@atlas-boots.ma')).toBe(true);
    expect(isBusinessEmail('nope')).toBe(false);
    expect(isBusinessEmail('nope@localhost')).toBe(false);
    expect(isBusinessEmail('two@@dots.ma')).toBe(false);
    expect(isBusinessEmail(42)).toBe(false);
  });
});

describe('submitting an enquiry', () => {
  it('files a valid lead with a quotable reference', async () => {
    const result = await submitEnquiry(VALID, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enquiry.reference).toMatch(/^LL-ADS-[A-Z0-9]{4}$/);
    expect(result.enquiry.status).toBe('new');
    expect(result.enquiry.partner).toBe('atlas-boots');
    expect(result.enquiry.packageId).toBe('pitch-side');
    expect(await listEnquiries()).toHaveLength(1);
  });

  it('strips markup so a lead can never carry a script into the portal', async () => {
    const result = await submitEnquiry(
      { ...VALID, brand: '<script>alert(1)</script>Atlas', message: '<img onerror=x> We sell boots for the derby.' },
      NOW
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enquiry.brand).not.toContain('<');
    expect(result.enquiry.message).not.toContain('<');
    expect(result.enquiry.brand).toContain('Atlas');
  });

  it('refuses incomplete or hostile input with a field to focus', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...VALID, brand: '' }, 'brand'],
      [{ ...VALID, contact: 'a' }, 'contact'],
      [{ ...VALID, email: 'not-an-email' }, 'email'],
      [{ ...VALID, message: 'short' }, 'message'],
    ];
    for (const [payload, field] of cases) {
      const result = await submitEnquiry(payload, NOW);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.field).toBe(field);
      expect(result.error.length).toBeGreaterThan(5);
      expect(result.errorAr.length).toBeGreaterThan(5);
    }
    expect(await listEnquiries()).toHaveLength(0);
  });

  it('falls back to the flagship placement for an unknown package id', async () => {
    const result = await submitEnquiry({ ...VALID, packageId: 'free-forever' }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enquiry.packageId).toBe(AD_PACKAGES[0].id);
  });

  it('issues a unique reference per lead and keeps the newest first', async () => {
    const first = await submitEnquiry(VALID, NOW);
    const second = await submitEnquiry({ ...VALID, brand: 'KitLab' }, NOW + 1000);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.enquiry.reference).not.toBe(second.enquiry.reference);
    const leads = await listEnquiries();
    expect(leads[0].brand).toBe('KitLab');
  });
});

describe('working the queue', () => {
  it('moves a lead through the pipeline and marks it acknowledged', async () => {
    const created = await submitEnquiry(VALID, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const contacted = await updateEnquiry(created.enquiry.id, 'contacted', NOW + 1);
    expect(contacted.ok).toBe(true);
    if (!contacted.ok) return;
    expect(contacted.enquiry.status).toBe('contacted');
    expect(contacted.enquiry.acknowledged).toBe(true);

    const won = await updateEnquiry(created.enquiry.id, 'won', NOW + 2);
    expect(won.ok && won.enquiry.status === 'won').toBe(true);
  });

  it('refuses unknown ids and unknown statuses', async () => {
    const created = await submitEnquiry(VALID, NOW);
    if (!created.ok) return;
    expect((await updateEnquiry('nope', 'won')).ok).toBe(false);
    expect((await updateEnquiry(created.enquiry.id, 'archived')).ok).toBe(false);
    expect((await updateEnquiry(undefined, 'won')).ok).toBe(false);
  });
});
