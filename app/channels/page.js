import LiveChannelsGrid from '@/components/LiveChannelsGrid';
import { getLiveChannels } from '@/lib/broadcast/feeds';
import { getChannelStatuses } from '@/lib/broadcast/probe';
import logger from '@/lib/logger';
import { browsableChannels } from '@/lib/broadcast/pool';

export const metadata = {
  title: 'Live Channels & Events — Limon Live',
  description: 'Live channels and events from dynamic M3U/JSON feeds, with real-time status.',
  alternates: { canonical: '/channels' },
};

// Rendered per request: the channel list is server-rendered (so the grid is
// never empty) and probes are individually cached for 90s in the cache layer.
export const dynamic = 'force-dynamic';

async function loadInitialChannelFeed() {
  try {
    const channels = browsableChannels(await getLiveChannels());
    // Bounded, best-effort probing — unverified channels report `unknown`.
    const statuses = await getChannelStatuses(channels, { limit: 24 });
    return { channels, statuses, checkedAt: Date.now() };
  } catch (err) {
    logger.error('Channels page: live feed load failed', err);
    return { channels: [], statuses: {}, checkedAt: null };
  }
}

export default async function ChannelsPage() {
  // Server-render the channel list so the grid is never empty: even if the
  // client-side status probe is blocked, every channel is listed and clickable.
  // `getLiveChannels` never throws — it falls back to cached / standby channels.
  const { channels, statuses, checkedAt } = await loadInitialChannelFeed();

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
          Featured live events. Large IPTV playlists stay in the background and are matched to fixtures automatically, keeping this view focused.
        </p>
      </header>
      <LiveChannelsGrid
        initialChannels={initialChannels.length ? initialChannels : null}
        initialCheckedAt={checkedAt}
      />
    </div>
  );
}
