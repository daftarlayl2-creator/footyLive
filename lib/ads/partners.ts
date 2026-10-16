/**
 * Sports-themed partner creatives for the top rotating ad banner.
 *
 * These are first-party house/partner promos (no third-party scripts): each
 * slide is pure CSS/SVG, so the rotation stays smooth and brand-safe. The
 * Adsterra network slot rotates in as one of the creatives — a real ad every
 * few slides, partner art in between, so the banner always has something on
 * air even when the network has no fill.
 *
 * Every house creative now points at the platform's own advertiser desk
 * (`/advertise?partner=<id>`), and the rotation ends on the "Advertise With Us"
 * slide. The old `https://example.com/...` placeholders are gone: a click on a
 * live banner can never land on a parked domain again.
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
  /** Where the CTA goes: an internal route for house slides, a URL for network. */
  href: string;
  /** True when `href` leaves the platform (external ads get the sponsored rel). */
  external?: boolean;
  /** Network creative: renders the Adsterra unit instead of house art. */
  network?: boolean;
  /** The house ad-slots slide that opens the advertiser onboarding modal. */
  advertise?: boolean;
}

export const PARTNER_ROTATION_MS = 7_000;

/** The internal advertiser desk every house creative links to. */
export const ADVERTISE_HREF = '/advertise';

/** Deep link from a banner slide to the advertiser desk, pre-selecting the brand. */
export function advertiseHrefFor(partnerId: string): string {
  return `${ADVERTISE_HREF}?partner=${encodeURIComponent(partnerId)}`;
}

export const SPORTS_PARTNERS: readonly PartnerCreative[] = [
  {
    id: 'atlas-boots',
    brand: 'Atlas Boots',
    tagline: 'Speed wins derbies. Grip the big nights.',
    cta: 'Shop the drop',
    accent: '#CCFF00',
    deep: '#1A2A00',
    icon: 'boot',
    href: advertiseHrefFor('atlas-boots'),
  },
  {
    id: 'hydrasport',
    brand: 'HydraSport',
    tagline: 'Hydrate like a starter — electrolytes for 90 minutes.',
    cta: 'Fuel up',
    accent: '#6EE7FF',
    deep: '#04202B',
    icon: 'bottle',
    href: advertiseHrefFor('hydrasport'),
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
    href: advertiseHrefFor('kitlab'),
  },
  {
    id: 'prozone-analytics',
    brand: 'ProZone Data',
    tagline: 'Expected goals, pressing maps and live xG for every fixture.',
    cta: 'Try the beta',
    accent: '#B49CFF',
    deep: '#160A2E',
    icon: 'whistle',
    href: advertiseHrefFor('prozone-analytics'),
  },
  {
    id: 'golden-boot-tours',
    brand: 'Golden Boot Tours',
    tagline: 'Away days, sorted — flights and seats for Europe’s biggest games.',
    cta: 'Plan an away day',
    accent: '#7DF9B0',
    deep: '#052014',
    icon: 'trophy',
    href: advertiseHrefFor('golden-boot-tours'),
  },
  {
    id: 'advertise-with-us',
    brand: 'Your brand here',
    tagline: '1.9M monthly impressions across the fan feed, match centre and Multi-View.',
    cta: 'Advertise With Us',
    accent: '#CCFF00',
    deep: '#12030B',
    icon: 'whistle',
    href: ADVERTISE_HREF,
    advertise: true,
  },
];

/** The house slide that opens the advertiser onboarding modal. */
export const ADVERTISE_CREATIVE: PartnerCreative =
  SPORTS_PARTNERS.find((creative) => creative.advertise) ?? SPORTS_PARTNERS[0];

/** Every real (non-network, non-house-ad) brand creative. */
export const HOUSE_PARTNERS: readonly PartnerCreative[] = SPORTS_PARTNERS.filter(
  (creative) => !creative.network && !creative.advertise
);
