import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, RadioTower } from 'lucide-react';
import { isLiveTvEnabled } from '@/lib/config/features';
import { resolveChannelStreams } from '@/lib/broadcast/channelStreams';
import StreamPlayer from '@/components/StreamPlayer';
import { getServerSubscription } from '@/lib/subscription/server';
import { subscriptionAccess } from '@/lib/subscription/plans';
import { preparePlayback } from '@/lib/subscription/playback';
import PremiumButton from '@/components/subscription/PremiumButton';

export const dynamic = 'force-dynamic';

export default async function ChannelPage({ params }) {
  // Live TV temporarily hidden: channel playback pages do not resolve.
  if (!isLiveTvEnabled()) notFound();
  const { id } = await params;
  const resolved = await resolveChannelStreams(id).catch(() => null);
  const channel = resolved?.channel;
  const status = resolved?.streams[0]?.health?.status || 'unknown';

  if (!channel) {
    return (
      <div className="space-y-6 w-full max-w-6xl mx-auto">
        <Link href="/channels" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to channels
        </Link>
        <div className="rounded-2xl border border-navy-750 bg-navy-850 p-8 text-center space-y-3">
          <p className="text-sm font-bold text-white">Channel not found in the current feeds</p>
          <p className="text-xs text-zinc-400">
            It may have ended, or the feed rotated its links. Live channels are re-read every minute.
          </p>
          <Link
            href="/channels"
            className="inline-flex items-center gap-1.5 rounded-lg lime-cta px-3.5 py-1.5 text-[11px] font-bold"
          >
            Browse live channels
          </Link>
        </div>
      </div>
    );
  }

  const access = subscriptionAccess((await getServerSubscription()).grants);
  const playback = preparePlayback(resolved.streams, access);
  const channels = playback.streams;
  const playbackUrl = playback.defaultUrl;

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      <Link
        href="/channels"
        className="inline-flex items-center gap-2 rounded-lg bg-navy-950/70 border border-navy-750 px-3.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-lime-400 hover:border-lime-500/40 transition-all"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to channels
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        {status === 'live' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-500/10 border border-lime-500/30 px-2.5 py-0.5 text-[11px] font-extrabold text-lime-600 dark:text-lime-400">
            <span className="live-dot relative flex h-1.5 w-1.5 rounded-full bg-lime-500" />
            ON AIR
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100/80 border border-navy-200 dark:bg-navy-900 dark:border-navy-750 px-2.5 py-0.5 text-[11px] font-extrabold text-navy-600 dark:text-zinc-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-lime-400" />
            </span>
            {status === 'offline' ? 'UNVERIFIED · TRY ANYWAY' : 'STANDBY'}
          </span>
        )}
        <Link href={`/multistream?channel=${id}`} className="tactile rounded-xl border border-lime-500/30 px-3 py-1.5 text-xs font-bold text-lime-600 dark:text-lime-300">Open in Multi-View</Link>
        <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">{channel.name}</h1>
        {channel.group && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
            <RadioTower className="h-3 w-3" />
            {channel.group}
          </span>
        )}
      </div>

      <PremiumButton />
      <StreamPlayer streamUrl={playbackUrl} channels={channels} matchTitle={channel.name} matchStatus="live" />

      <div className="space-y-1.5">
        <p className="text-[11px] text-navy-500 dark:text-zinc-400">
          Source: {channel.source}. Playback is routed through Limon Live&apos;s signed proxy;{' '}
          {channels.length > 1
            ? `${channels.length} sources found for this channel — if one stops, the player moves to the next automatically.`
            : 'if the stream stops, try again shortly as feed links rotate.'}
        </p>
        <p className="text-[11px] text-navy-500 dark:text-zinc-400">
          {status === 'live'
            ? 'The status probe confirmed this feed is serving media right now.'
            : 'The background probe could not verify this feed (CDNs often block server-side checks). Playback was still attempted through the proxy — use Server 2, 3 … below if this one stays blank.'}
        </p>
      </div>
    </div>
  );
}
