import { BookOpen, CalendarClock, ExternalLink, Landmark, UserRound } from 'lucide-react';
import { FactTile } from '@/components/club/ClubHero';
import { fallbackClubBio, getClubFacts } from '@/lib/clubs/clubProfile';
import SafeExternalLink from '@/components/ui/ExternalLink';

function managerSinceLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return `Since ${new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)}`;
}

/**
 * Founded / stadium / manager tiles (Wikidata), streamed into the hero.
 * Missing facts are simply omitted — never guessed.
 */
export async function ClubFactTiles({ name, national = false, venueHint }) {
  const facts = await getClubFacts(name, national);
  const stadium = facts.stadium || venueHint;
  return (
    <>
      {facts.founded && <FactTile icon={CalendarClock} label="Founded" value={String(facts.founded)} />}
      {stadium && <FactTile icon={Landmark} label="Stadium" value={stadium} />}
      {facts.manager && (
        <FactTile
          icon={UserRound}
          label={national ? 'Head coach' : 'Manager'}
          value={facts.manager}
          detail={facts.managerSince ? managerSinceLabel(facts.managerSince) : undefined}
        />
      )}
    </>
  );
}

export function ClubAboutSkeleton() {
  return (
    <div className="app-card space-y-3 p-5 sm:p-6" aria-busy="true">
      <span className="skeleton block h-4 w-40 rounded-md" />
      <span className="skeleton block h-3 w-full rounded-md" />
      <span className="skeleton block h-3 w-[92%] rounded-md" />
      <span className="skeleton block h-3 w-[78%] rounded-md" />
    </div>
  );
}

/** Club history / bio: Wikipedia summary, or a bio built from live ESPN data. */
export async function ClubAbout({ club }) {
  const facts = await getClubFacts(club.name, Boolean(club.isNational));
  const summary = facts.summary;
  const text = summary?.extract || fallbackClubBio(club);
  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <section className="app-card relative overflow-hidden p-5 sm:p-6" aria-labelledby="club-about-heading">
      <span className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-lime-500/10 blur-3xl" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-lime-500/15 text-lime-700 dark:text-lime-400">
          <BookOpen className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="club-about-heading" className="text-base font-extrabold tracking-tight text-navy-900 dark:text-white">
            About {club.name}
          </h2>
          {summary?.description && <p className="text-[11px] font-semibold text-navy-500 dark:text-zinc-400">{summary.description}</p>}
        </div>
      </div>
      <div className="relative mt-3.5 space-y-3 text-[14px] leading-relaxed text-navy-700 dark:text-zinc-300">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {summary?.url ? (
        <p className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-navy-500 dark:text-zinc-400">
          <SafeExternalLink
            href={summary.url}
            fallbackLabel="Wikipedia page temporarily unreachable"
            className="tactile inline-flex items-center gap-1 rounded-full border border-navy-200 px-2.5 py-1 font-bold text-navy-700 hover:border-lime-500/50 hover:text-lime-700 dark:border-navy-750 dark:text-zinc-300 dark:hover:text-lime-400"
          >
            Read more on Wikipedia <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </SafeExternalLink>
          <span>
            Text from Wikipedia, licensed under{' '}
            <SafeExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline">
              CC BY-SA 4.0
            </SafeExternalLink>
          </span>
        </p>
      ) : (
        <p className="relative mt-4 text-[11px] font-semibold text-navy-500 dark:text-zinc-400">Summary generated from live ESPN club data.</p>
      )}
    </section>
  );
}
