import Link from 'next/link';
import { ArrowLeft, RadioTower } from 'lucide-react';
import { getLiveChannelById, toPlaybackUrl } from '@/lib/broadcast/feeds';
import StreamPlayer from '@/components/StreamPlayer';

export const revalidate = 60;

export default async function ChannelPage({ params }) {
  const { id } = await params;
  const channel = /^[a-f0-9]{16}(-\d+)?$/.test(id) ? await getLiveChannelById(id).catch(() => null) : null;

  if (!channel) {
    return (
      <div className="space-y-6 w-full max-w-6xl mx-auto">
        <Link href="/channels" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to channels
        </Link>
        <div className="rounded-2xl border border-zinc-800 bg-[#060609] p-8 text-center">
          <p className="text-sm font-bold text-white">Channel not found</p>
          <p className="mt-1 text-xs text-zinc-500">It may have ended or been removed from the feed.</p>
        </div>
      </div>
    );
  }

  // Only the signed proxy link reaches the browser — never the raw upstream URL.
  const playbackUrl = toPlaybackUrl(channel);
  const channels = [{ name: channel.name, proxiedUrl: playbackUrl, quality: 'HD' }];

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      <Link
        href="/channels"
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-950/70 border border-zinc-850 px-3.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to channels
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-red-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          LIVE
        </span>
        <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">{channel.name}</h1>
        {channel.group && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500">
            <RadioTower className="h-3 w-3" />
            {channel.group}
          </span>
        )}
      </div>

      <StreamPlayer streamUrl={playbackUrl} channels={channels} matchTitle={channel.name} matchStatus="live" />

      <p className="text-[11px] text-zinc-500">
        Source: {channel.source}. Playback is routed through FootyLive&apos;s proxy; if the stream stops, try again shortly as feed links rotate.
      </p>
    </div>
  );
}
