import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CalendarClock, Info, Landmark, UserRound } from 'lucide-react';
import BackButton from '@/components/ui/BackButton';
import ClubHero, { FactTile, FactTilesSkeleton } from '@/components/club/ClubHero';
import { ClubAbout, ClubAboutSkeleton, ClubFactTiles } from '@/components/club/ClubFacts';
import ClubTabs from '@/components/club/ClubTabs';
import { getClubCore, getClubFacts, resolveClub } from '@/lib/clubs/clubProfile';
import { groupSquad } from '@/lib/clubs/espnClub';
import { heroPalette } from '@/lib/clubs/colors';

export const dynamic = 'force-dynamic';

const SMALL_WORDS = new Set(['de', 'del', 'la', 'le', 'of', 'the', 'and', 'da', 'do', 'des', 'du', 'van', 'von']);

function parseSlugSafely(id) {
  try {
    return decodeURIComponent(String(id)).replace(/^\d+-?/, '');
  } catch {
    return '';
  }
}

function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Outages throw (→ error.js with a retry); unknown clubs resolve to `core: null`. */
async function loadCore(id) {
  const { espnId, slug } = await resolveClub(id);
  const core = espnId ? await getClubCore(espnId) : null;
  return { core, slug };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { core, slug } = await loadCore(id).catch(() => ({ core: null, slug: parseSlugSafely(id) }));
  const name = core?.club.name || titleFromSlug(slug) || 'Club';
  const league = core?.club.league?.name;
  return {
    title: `${name} — Fixtures, results & squad | EVIV Live`,
    description: `${name}${league ? ` (${league})` : ''}: club history, recent form, upcoming fixtures, current squad, stadium and manager.`,
    openGraph: core?.club.logo ? { images: [{ url: core.club.logo, width: 500, height: 500 }] } : undefined,
  };
}

/** Clubs our live provider does not cover still get a Wikipedia-powered profile. */
function LiteClubProfile({ name, facts }) {
  return (
    <div className="space-y-5">
      <BackButton fallback="/standings" />
      <ClubHero club={{ name, logo: facts.summary?.thumbnail }}>
        {facts.founded && <FactTile icon={CalendarClock} label="Founded" value={String(facts.founded)} />}
        {facts.stadium && <FactTile icon={Landmark} label="Stadium" value={facts.stadium} />}
        {facts.manager && <FactTile icon={UserRound} label="Manager" value={facts.manager} />}
      </ClubHero>
      <ClubAbout club={{ name }} />
      <p className="app-card flex items-start gap-2.5 p-4 text-xs font-semibold text-navy-600 dark:text-zinc-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
        Live results, fixtures and the squad list for {name} aren&apos;t available from our live data provider yet.
      </p>
    </div>
  );
}

export default async function ClubPage({ params }) {
  const { id } = await params;
  const { core, slug } = await loadCore(id);

  if (!core) {
    const name = titleFromSlug(slug);
    if (!name) notFound();
    const facts = await getClubFacts(name);
    if (!facts.summary) notFound();
    return <LiteClubProfile name={facts.summary.title || name} facts={facts} />;
  }

  const { club } = core;
  const palette = heroPalette(club.color, club.alternateColor);

  return (
    <div className="space-y-5">
      <BackButton fallback="/standings" />

      <ClubHero club={club} form={core.form}>
        <Suspense fallback={<FactTilesSkeleton count={3} />}>
          <ClubFactTiles name={club.name} national={Boolean(club.isNational)} venueHint={core.homeVenue} />
        </Suspense>
      </ClubHero>

      <Suspense fallback={<ClubAboutSkeleton />}>
        <ClubAbout club={club} />
      </Suspense>

      <ClubTabs
        results={core.results}
        fixtures={core.fixtures}
        squad={groupSquad(core.squad)}
        form={core.form}
        accent={palette.from}
      />
    </div>
  );
}
