import Link from 'next/link';
import { ArrowLeft, RadioTower } from 'lucide-react';
import { getChannelSources, toPlaybackUrl } from '@/lib/broadcast/feeds';
import { probeChannel, withTimeout } from '@/lib/broadcast/probe';
import { detectStreamKind } from '@/lib/player/servers';
import StreamPlayer from '@/components/StreamPlayer';

export const revalidate = 60;

export default async function ChannelPage({ params }) {
  const { id } = await params;
  // The opened channel first, then other feed entries carrying the same channel.
  const sources = /^[a-f0-9]{16}(-\d+)?$/.test(id) ? await getChannelSources(id).catch(() => []) : [];
  const channel = sources[0] ?? null;

  // Best-effort, time-boxed status check. A blocked probe never blocks
  // playback: the player below always points at the signed /api/proxy route.
  const status = channel
    ? await withTimeout(probeChannel(channel).catch(() => 'unknown'), 1_500, 'unknown')
    : 'unknown';

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

  // Only signed proxy links reach the browser — never the raw upstream URLs.
  const channels = sources.map((source) => {
    const proxiedUrl = toPlaybackUrl(source);
    return { name: source.name, url: proxiedUrl, proxiedUrl, quality: 'HD', kind: detectStreamKind(proxiedUrl) };
  });
  const playbackUrl = channels[0].proxiedUrl;

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
        <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">{channel.name}</h1>
        {channel.group && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
            <RadioTower className="h-3 w-3" />
            {channel.group}
          </span>
        )}
      </div>

      <StreamPlayer streamUrl={playbackUrl} channels={channels} matchTitle={channel.name} matchStatus="live" />

      <div className="space-y-1.5">
        <p className="text-[11px] text-navy-500 dark:text-zinc-400">
          Source: {channel.source}. Playback is routed through EVIV Live&apos;s signed proxy;{' '}
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
