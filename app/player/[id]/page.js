import { notFound } from 'next/navigation';
import BackButton from '@/components/ui/BackButton';
import PlayerBanner from '@/components/players/PlayerBanner';
import SeasonStats from '@/components/players/SeasonStats';
import TrophyCabinet from '@/components/players/TrophyCabinet';
import { getPlayerProfile } from '@/lib/players/playerProfile';

export const dynamic = 'force-dynamic';

function contextOf(query) {
  return [typeof query?.club === 'string' ? query.club : '', typeof query?.league === 'string' ? query.league : 'all'];
}

export async function generateMetadata({ params, searchParams }) {
  const { id } = await params;
  const [club, league] = contextOf(await searchParams);
  const player = await getPlayerProfile(id, club, league).catch(() => null);
  return {
    title: `${player?.name || 'Player'} — Stats & trophies | EVIV Live`,
    description: player ? `${player.name}: season appearances, goals, assists, minutes, pass accuracy, club and selected honors.` : 'Football player profiles, season performance and trophy cabinets.',
  };
}

export default async function PlayerPage({ params, searchParams }) {
  const { id } = await params;
  const [club, league] = contextOf(await searchParams);
  const player = await getPlayerProfile(id, club, league);
  if (!player) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackButton fallback="/standings" />
      <PlayerBanner player={player} />
      <SeasonStats season={player.season} />
      <TrophyCabinet honors={player.honors} note={player.honorsNote} />
      <p className="px-1 text-[10px] text-navy-500 dark:text-zinc-400">Profile & statistics: ESPN. Optional editorial honors and valuations are dated and linked to their sources.</p>
    </div>
  );
}
