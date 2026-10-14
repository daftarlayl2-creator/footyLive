import LiveChannelsGrid from '@/components/LiveChannelsGrid';
import { getLiveChannels } from '@/lib/broadcast/feeds';
import { getChannelStatuses } from '@/lib/broadcast/probe';
import logger from '@/lib/logger';

export const metadata = {
  title: 'Live Channels — EVIV Live',
  description: 'Live channels and events from dynamic M3U/JSON feeds, with real-time status.',
};

// Rendered per request: the channel list is server-rendered (so the grid is
// never empty) and probes are individually cached for 90s in the cache layer.
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  // Server-render the channel list so the grid is never empty: even if the
  // client-side status probe is blocked, every channel is listed and clickable.
  let channels = [];
  let checkedAt = null;
  let statuses = {};
  let serverError = null;

  try {
    channels = await getLiveChannels();
    // Bounded, best-effort probing — unverified channels report `unknown`.
    statuses = await getChannelStatuses(channels, { limit: 24 });
    checkedAt = Date.now();
  } catch (err) {
    logger.error('Channels page: live feed load failed', err);
    serverError = 'Live feeds are temporarily unavailable — retrying automatically.';
  }

  const initialChannels = channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    group: ch.group || '',
    logo: ch.logo || '',
    source: ch.source,
    status: statuses[ch.id] ?? 'unknown',
    // Always route to the player page, which resolves a signed /api/proxy link.
    href: `/channel/${ch.id}`,
    playable: true,
  }));

  return (
    <div className="space-y-6 w-full">
      <header>
        <h1 className="text-xl font-bold text-navy-900 dark:text-white">
          Live <span className="brand-gradient-text">Channels</span>
        </h1>
        <p className="mt-1 text-xs text-navy-500 dark:text-zinc-400">
          Events from our live feeds. Status is checked automatically; click a channel to watch it through the EVIV Live proxy.
        </p>
        {serverError && (
          <p className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">{serverError}</p>
        )}
      </header>
      <LiveChannelsGrid
        initialChannels={initialChannels.length ? initialChannels : null}
        initialCheckedAt={checkedAt}
      />
    </div>
  );
}
