import LiveChannelsGrid from '@/components/LiveChannelsGrid';

export const metadata = {
  title: 'Live Channels — FootyLive',
  description: 'Live channels and events from dynamic M3U/JSON feeds, with real-time status.',
};

export default function ChannelsPage() {
  return (
    <div className="space-y-6 w-full">
      <header>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Live Channels</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Events from our live feeds. Status is checked automatically; click a channel to watch it through the FootyLive proxy.
        </p>
      </header>
      <LiveChannelsGrid />
    </div>
  );
}
