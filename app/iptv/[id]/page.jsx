import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, RadioTower } from 'lucide-react';
import StreamPlayer from '@/components/StreamPlayer';
import PremiumButton from '@/components/subscription/PremiumButton';
import { isLiveTvEnabled } from '@/lib/config/features';
import { getIptvChannelById } from '@/lib/iptv/catalog';
import { toPlaybackUrl } from '@/lib/broadcast/feeds';
import { getServerSubscription } from '@/lib/subscription/server';
import { subscriptionAccess } from '@/lib/subscription/plans';
import { preparePlayback } from '@/lib/subscription/playback';

export const dynamic = 'force-dynamic';

export default async function IptvChannelPage({ params }) {
  // Live TV temporarily hidden: IPTV playback pages do not resolve.
  if (!isLiveTvEnabled()) notFound();
  const { id } = await params;
  const channel = await getIptvChannelById(id).catch(() => null);

  if (!channel) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Link href="/live-channels" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to channels
        </Link>
        <div className="glass-panel rounded-3xl p-6 text-sm text-navy-700 dark:text-zinc-300">
          <p className="font-bold text-navy-900 dark:text-white">Channel not found in the current catalogue.</p>
          <p className="mt-2">It may have been removed from the playlist source. The catalogue refreshes regularly.</p>
          <Link href="/live-channels" className="tactile mt-4 inline-flex rounded-xl bg-lime-500 px-4 py-2 text-xs font-extrabold text-navy-950">
            Browse live channels
          </Link>
        </div>
      </div>
    );
  }

  const playbackUrl = toPlaybackUrl(channel);
  const access = subscriptionAccess((await getServerSubscription()).grants);
  const playback = preparePlayback(
    [{ name: channel.name, url: playbackUrl, proxiedUrl: playbackUrl, provider: 'iptv', quality: channel.quality || 'HD' }],
    access
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Link
        href="/live-channels"
        className="inline-flex items-center gap-2 rounded-lg border border-navy-750 bg-navy-950/70 px-3.5 py-1.5 text-xs font-bold text-zinc-400 transition-all hover:border-lime-500/40 hover:text-lime-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to channels
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-zinc-900 dark:text-white sm:text-lg">{channel.name}</h1>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
          <RadioTower className="h-3 w-3" />
          {[channel.category, channel.region].filter(Boolean).join(' · ')}
        </span>
      </div>

      <PremiumButton />
      <StreamPlayer streamUrl={playback.defaultUrl} channels={playback.streams} matchTitle={channel.name} matchStatus="live" />

      <p className="text-[11px] text-navy-500 dark:text-zinc-400">
        Source: verified playlist catalogue ({channel.playlist}). Playback is routed through Limon Live&apos;s signed proxy.
        Third-party streams can go offline, be geo-restricted, or use formats your browser cannot play — if this one stays blank, try another channel.
      </p>
    </div>
  );
}
