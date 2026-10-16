import { notFound } from 'next/navigation';
import BackButton from '@/components/ui/BackButton';
import PlayerBanner from '@/components/players/PlayerBanner';
import SeasonStats from '@/components/players/SeasonStats';
import TrophyCabinet from '@/components/players/TrophyCabinet';
import { getPlayerProfile } from '@/lib/players/playerProfile';
import { absoluteUrl, serializeJsonLd } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

function contextOf(query) {
  return [typeof query?.club === 'string' ? query.club : '', typeof query?.league === 'string' ? query.league : 'all'];
}

export async function generateMetadata({ params, searchParams }) {
  const { id } = await params;
  const [club, league] = contextOf(await searchParams);
  const player = await getPlayerProfile(id, club, league).catch(() => null);
  const canonical = absoluteUrl(`/player/${encodeURIComponent(id)}`);
  return {
    alternates: { canonical },
    robots: player ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: 'profile', title: `${player?.name || 'Player'} | LIMON LIVE`, url: canonical },
    title: `${player?.name || 'Player'} — Stats & trophies | Limon Live`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        '@context': 'https://schema.org', '@type': 'Person', '@id': `${absoluteUrl(`/player/${id}`)}#player`,
        name: player.name, url: absoluteUrl(`/player/${id}`), ...(player.fullName ? { alternateName: player.fullName } : {}),
        ...(player.nationality ? { nationality: player.nationality } : {}),
        ...(player.club ? { memberOf: { '@type': 'SportsTeam', name: player.club.name } } : {}),
      }) }} />
      <BackButton fallback="/standings" />
      <PlayerBanner player={player} />
      <SeasonStats season={player.season} />
      <TrophyCabinet honors={player.honors} note={player.honorsNote} />
      <p className="px-1 text-[10px] text-navy-500 dark:text-zinc-400">Profile & statistics: ESPN. Optional editorial honors and valuations are dated and linked to their sources.</p>
    </div>
  );
}
