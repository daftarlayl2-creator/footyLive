/**
 * Sports-themed partner creatives for the top rotating ad banner.
 *
 * These are first-party house/partner promos (no third-party scripts): each
 * slide is pure CSS/SVG, so the rotation stays smooth and brand-safe. The
 * Adsterra network slot rotates in as one of the creatives — a real ad every
 * few slides, partner art in between, so the banner always has something on
 * air even when the network has no fill.
 */

export interface PartnerCreative {
  id: string;
  brand: string;
  tagline: string;
  cta: string;
  /** Accent palette on the deep-burgundy banner canvas. */
  accent: string;
  deep: string;
  /** Small inline SVG pictogram key drawn beside the copy. */
  icon: 'boot' | 'ball' | 'whistle' | 'jersey' | 'trophy' | 'bottle';
  href: string;
  /** Network creative: renders the Adsterra unit instead of house art. */
  network?: boolean;
}

export const PARTNER_ROTATION_MS = 7_000;

export const SPORTS_PARTNERS: readonly PartnerCreative[] = [
  {
    id: 'atlas-boots',
    brand: 'Atlas Boots',
    tagline: 'Speed wins derbies. Grip the big nights.',
    cta: 'Shop the drop',
    accent: '#CCFF00',
    deep: '#1A2A00',
    icon: 'boot',
    href: 'https://example.com/atlas-boots',
  },
  {
    id: 'hydrasport',
    brand: 'HydraSport',
    tagline: 'Hydrate like a starter — electrolytes for 90 minutes.',
    cta: 'Fuel up',
    accent: '#6EE7FF',
    deep: '#04202B',
    icon: 'bottle',
    href: 'https://example.com/hydrasport',
  },
  {
    id: 'network-ads',
    brand: 'Sponsored',
    tagline: '',
    cta: '',
    accent: '#CCFF00',
    deep: '#18030A',
    icon: 'ball',
    href: '',
    network: true,
  },
  {
    id: 'kitlab',
    brand: 'KitLab',
    tagline: 'The 2026 jerseys just landed — home, away, third.',
    cta: 'Browse kits',
    accent: '#FFB454',
    deep: '#2B1503',
    icon: 'jersey',
    href: 'https://example.com/kitlab',
  },
  {
    id: 'prozone-analytics',
    brand: 'ProZone Data',
    tagline: 'Expected goals, pressing maps and live xG for every fixture.',
    cta: 'Try the beta',
    accent: '#B49CFF',
    deep: '#160A2E',
    icon: 'whistle',
    href: 'https://example.com/prozone',
  },
  {
    id: 'golden-boot-tours',
    brand: 'Golden Boot Tours',
    tagline: 'Away days, sorted — flights and seats for Europe’s biggest games.',
    cta: 'Plan an away day',
    accent: '#7DF9B0',
    deep: '#052014',
    icon: 'trophy',
    href: 'https://example.com/goldenboottours',
  },
];
