import Link from 'next/link';
import IptvCatalogue from '@/components/iptv/IptvCatalogue';
import { isLiveTvEnabled } from '@/lib/config/features';
import { getIptvCatalog, toPublicChannel } from '@/lib/iptv/catalog';
import logger from '@/lib/logger';

export const metadata = {
  title: 'Live TV Channels — Limon Live',
  description: 'Browse the verified IPTV channel catalogue: search, filter by category and region, save favorites and watch live.',
  alternates: { canonical: '/live-channels' },
};

export const dynamic = 'force-dynamic';

function Unavailable({ title, message }) {
  return (
    <div className="w-full space-y-4">
      <header>
        <h1 className="text-xl font-bold text-navy-900 dark:text-white">
          Live TV <span className="brand-gradient-text">Channels</span>
        </h1>
      </header>
      <div className="glass-panel rounded-3xl p-6 text-sm leading-relaxed text-navy-700 dark:text-zinc-300">
        <p className="font-bold text-navy-900 dark:text-white">{title}</p>
        <p className="mt-2">{message}</p>
        <Link href="/" className="tactile mt-4 inline-flex rounded-xl bg-lime-500 px-4 py-2 text-xs font-extrabold text-navy-950">
          Browse today&apos;s matches
        </Link>
      </div>
    </div>
  );
}

export default async function LiveChannelsPage() {
  if (!isLiveTvEnabled()) {
    return (
      <Unavailable
        title="Live TV is temporarily unavailable."
        message="We are rebuilding the channel catalogue. Live scores, fixtures and match streams are unaffected."
      />
    );
  }

  let catalog = null;
  try {
    catalog = await getIptvCatalog();
  } catch (err) {
    logger.error('IPTV catalogue page load failed', err);
  }

  if (!catalog || catalog.channels.length === 0) {
    return (
      <Unavailable
        title="The channel catalogue could not be loaded."
        message="The playlist source did not return any verified channels right now. Nothing is wrong with your connection — please try again shortly."
      />
    );
  }

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-xl font-bold text-navy-900 dark:text-white">
          Live TV <span className="brand-gradient-text">Channels</span>
        </h1>
        <p className="mt-1 text-xs text-navy-500 dark:text-zinc-400">
          Channels from the verified Limon playlist catalogue. Individual streams are provided by third parties and may go offline without notice.
        </p>
      </header>
      <IptvCatalogue
        channels={catalog.channels.map(toPublicChannel)}
        categories={catalog.categories}
        regions={catalog.regions}
        stale={catalog.stale}
      />
    </div>
  );
}
