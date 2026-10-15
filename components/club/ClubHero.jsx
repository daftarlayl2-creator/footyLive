import Link from 'next/link';
import { MapPin, Palette, Trophy } from 'lucide-react';
import CrestDrop from '@/components/clubs/CrestDrop';
import FormStrip from '@/components/club/FormStrip';
import { heroPalette } from '@/lib/clubs/colors';
import { findStandingsLeague } from '@/lib/standings';

export function FactTile({ icon: Icon, label, value, detail }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur-md">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
        <Icon className="h-4.5 w-4.5 text-white" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/65">{label}</p>
        <p className="truncate text-sm font-extrabold text-white" title={typeof value === 'string' ? value : undefined}>
          {value}
        </p>
        {detail && <p className="truncate text-[11px] font-semibold text-white/60">{detail}</p>}
      </div>
    </div>
  );
}

export function FactTilesSkeleton({ count = 3 }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-3">
      <span className="h-9 w-9 animate-pulse rounded-xl bg-white/15" />
      <div className="flex-1 space-y-1.5">
        <span className="block h-2.5 w-14 animate-pulse rounded bg-white/15" />
        <span className="block h-3.5 w-24 animate-pulse rounded bg-white/20" />
      </div>
    </div>
  ));
}

/**
 * Club page hero: official-colour gradient, high-resolution crest, league,
 * standing and form. `children` receives the streamed fact tiles
 * (founded / stadium / manager) so the hero paints before Wikidata answers.
 */
export default function ClubHero({ club, form = [], children }) {
  const palette = heroPalette(club.color, club.alternateColor);
  const standingsLeague = club.league ? findStandingsLeague(club.league.slug) : null;
  const record = club.record;

  return (
    <section
      className="relative overflow-hidden rounded-3xl text-white shadow-app-raised"
      style={{ background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)` }}
      aria-label={`${club.name} club profile`}
    >
      {/* Depth: scrim, glow and a giant watermark crest */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/20 to-black/60" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      {club.logo && (
        <img
          src={club.logo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-10 h-80 w-80 select-none object-contain opacity-[0.08] blur-[1px]"
        />
      )}

      <div className="relative p-5 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
          {/* Crest inside a liquid-glass droplet, its glow tinted with the club colour */}
          <div className="relative shrink-0">
            <span className="absolute inset-3 -z-0 rounded-full bg-white/25 blur-2xl" aria-hidden="true" />
            <CrestDrop src={club.logo} name={club.name} size="xl" tone="dark" tint={palette.swatches[0]} priority />
          </div>

          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              {club.league &&
                (standingsLeague ? (
                  <Link
                    href={`/standings?league=${encodeURIComponent(standingsLeague.slug)}`}
                    className="tactile inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-extrabold backdrop-blur-md hover:bg-white/25"
                  >
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                    {club.league.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-[11px] font-extrabold backdrop-blur-md">
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                    {club.league.name}
                  </span>
                ))}
              {club.abbreviation && (
                <span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[11px] font-black tracking-widest">
                  {club.abbreviation}
                </span>
              )}
              {club.location && club.location !== club.name && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[11px] font-bold">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {club.location}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight drop-shadow-sm sm:text-5xl">{club.name}</h1>
            {club.nickname && <p className="text-sm font-semibold text-white/75">“{club.nickname}”</p>}

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-start">
              {club.standingSummary && <p className="text-sm font-bold text-white/90">{club.standingSummary}</p>}
              {record && (
                <p className="text-xs font-extrabold tabular-nums text-white/80">
                  <span className="text-lime-300">{record.wins}W</span> · {record.draws}D ·{' '}
                  <span className="text-red-300">{record.losses}L</span>
                  {record.points !== undefined && <span className="text-white/60"> · {record.points} pts</span>}
                </p>
              )}
              <FormStrip form={form} size="sm" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {children}
          {palette.swatches.length > 0 && (
            <FactTile
              icon={Palette}
              label="Club colours"
              value={
                <span className="mt-0.5 flex items-center gap-1.5">
                  {palette.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-5 w-5 rounded-full border-2 border-white/80 shadow"
                      style={{ background: swatch }}
                      title={swatch}
                    />
                  ))}
                  <span className="ml-1 font-mono text-[11px] font-bold uppercase text-white/70">{palette.swatches.join(' · ')}</span>
                </span>
              }
            />
          )}
        </div>
      </div>
    </section>
  );
}
