import AdvertiseLanding from '@/components/ads/AdvertiseLanding';
import { AD_PACKAGES } from '@/lib/ads/enquiries';

export const metadata = {
  title: 'Advertise With Us · Limon Live',
  description:
    'Reach 410k football fans every month: banner takeovers, half-time sponsorships and Multi-View placements on Limon Live. First-party creatives, honest reporting, reply in 24 hours.',
  alternates: { canonical: '/advertise' },
  openGraph: {
    title: 'Advertise With Us · Limon Live',
    description: 'Banner takeovers, half-time sponsorships and Multi-View placements for football brands.',
    url: '/advertise',
    type: 'website',
  },
};

/**
 * /advertise — the public advertiser desk.
 *
 * House slides on the rotating top banner deep-link here with
 * `?partner=<creative id>`, which pre-fills the onboarding modal's brand.
 */
export default async function AdvertisePage({ searchParams }) {
  const params = await searchParams;
  const partner = typeof params?.partner === 'string' ? params.partner.slice(0, 40) : '';
  const initialPackage = typeof params?.package === 'string' && AD_PACKAGES.some((row) => row.id === params.package)
    ? params.package
    : '';

  return (
    <div className="min-h-screen" data-advertise-page="">
      <AdvertiseLanding partner={partner} initialPackage={initialPackage} />
    </div>
  );
}
