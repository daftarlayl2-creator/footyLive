'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Flag } from 'lucide-react';
import TeamLogo from '@/components/clubs/TeamLogo';
import { clubHref } from '@/lib/clubs/links';
import { safePlayerImage } from '@/lib/players/normalize';
import { isTransparentCutoutUrl } from '@/lib/players/cutouts';

function Fact({ label, children }) {
  return <div className="glass-dark-tile min-w-0 rounded-2xl px-4 py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</dt><dd className="mt-1 flex items-center gap-2 text-sm font-extrabold text-white">{children}</dd></div>;
}

/** Portrait candidates: provider-ordered list, or the single ESPN headshot of older payloads. */
function portraitCandidates(player) {
  const candidates = Array.isArray(player.portraits) && player.portraits.length ? player.portraits
    : player.portrait ? [{ src: player.portrait, kind: 'headshot', credit: 'ESPN' }] : [];
  return candidates.filter((candidate) => {
    const src = safePlayerImage(candidate.src);
    if (!src || !(candidate.kind === 'cutout' || candidate.kind === 'headshot')) return false;
    // Transparent PNG cutouts (Transfermarkt style) — never an opaque thumbnail.
    return candidate.kind === 'cutout' ? isTransparentCutoutUrl(src) : isTransparentCutoutUrl(src) || /\.png$/i.test(new URL(src).pathname);
  });
}

/** Branded stand-in when no provider portrait loads: burgundy bust, lime keyline, shirt number. */
function PlayerSilhouette({ name, jersey }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 120" className="relative z-10 h-full w-full" role="img" aria-label={`${name} — portrait not published`} data-player-silhouette="">
      <defs>
        <linearGradient id={`ps-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5C1531" />
          <stop offset="1" stopColor="#2A0813" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="43" r="19" fill={`url(#ps-${id})`} stroke="#CCFF00" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M20 121c2-27 19-42 40-42s38 15 40 42Z" fill={`url(#ps-${id})`} stroke="#CCFF00" strokeOpacity="0.45" strokeWidth="1.2" />
      {jersey && (
        <text x="60" y="110" textAnchor="middle" fontSize="20" fontWeight="900" fill="#CCFF00" fillOpacity="0.9" fontFamily="Inter, system-ui, sans-serif">
          {jersey}
        </text>
      )}
    </svg>
  );
}

export default function PlayerBanner({ player }) {
  const [failedPortraits, setFailedPortraits] = useState([]);
  const [failedFlag, setFailedFlag] = useState(null);
  const href = clubHref(player.club);
  const value = player.marketValue;
  const historical = value && player.updatedAt - Date.parse(value.asOf) > 365 * 86_400_000;
  const amount = value ? new Intl.NumberFormat('en', { style: 'currency', currency: value.currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value.amount) : null;
  // Walk the candidates on load errors (keyed by URL, so a new player never inherits failures).
  const portrait = portraitCandidates(player).find((candidate) => !failedPortraits.includes(candidate.src)) ?? null;
  const flag = player.flag && failedFlag !== player.flag ? player.flag : null;
  const onFlagError = () => setFailedFlag(player.flag);

  return (
    <section className="glass-dark relative isolate overflow-hidden rounded-3xl p-5 sm:p-8" aria-labelledby="player-heading" data-player-banner="">
      {/* Depth, as on club cards: a faint national-flag watermark, a scrim and a lime glow. */}
      {flag && (
        <img
          src={flag}
          alt=""
          aria-hidden="true"
          onError={onFlagError}
          className="pointer-events-none absolute -left-16 top-1/2 -z-10 h-[150%] w-auto max-w-none -translate-y-1/2 select-none object-contain opacity-[0.09] blur-[2px] [mask-image:linear-gradient(to_right,black_45%,transparent_90%)]"
          data-player-flag-wash=""
        />
      )}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/0 via-black/10 to-black/40" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-lime-400/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Player card header: cutout in front of a semi-transparent national flag. */}
        <div
          className="relative isolate h-72 w-60 shrink-0 self-center self-auto overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-b from-navy-750/60 to-navy-950 shadow-xl ring-1 ring-lime-400/10 sm:h-96 sm:w-72"
          data-player-portrait={portrait?.kind || 'silhouette'}
          data-player-cutout={portrait?.kind === 'cutout' ? 'transparent' : 'none'}
        >
          {flag && (
            <img
              src={flag}
              alt=""
              aria-hidden="true"
              onError={onFlagError}
              className="pointer-events-none absolute inset-0 h-full w-full scale-150 select-none object-cover opacity-[0.28]"
              data-player-flag-overlay=""
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-navy-950/25 via-navy-950/30 to-navy-950/85" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-5 bottom-0 h-1/2 rounded-full bg-lime-400/20 blur-2xl" aria-hidden="true" />
          {portrait ? (
            <img
              key={portrait.src}
              src={portrait.src}
              alt={player.name}
              onError={() => setFailedPortraits((failed) => [...failed, portrait.src])}
              width={1024}
              height={1228}
              fetchPriority="high"
              decoding="async"
              sizes="(min-width: 640px) 288px, 240px"
              className="relative z-10 h-full w-full scale-[1.04] bg-transparent object-contain object-bottom drop-shadow-[0_18px_26px_rgba(0,0,0,0.65)]"
              data-portrait-credit={portrait.credit}
              data-portrait-resolution="high"

            />
          ) : (
            <PlayerSilhouette name={player.name} jersey={player.jersey} />
          )}
          {player.jersey && <span className="absolute right-3 top-3 z-20 flex h-11 min-w-11 items-center justify-center rounded-xl border border-eviv-lime/40 bg-eviv-burgundy/90 px-2 text-xl font-black text-eviv-lime shadow-lg backdrop-blur-md" aria-label={`Shirt number ${player.jersey}`} data-player-number-badge="">{player.jersey}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-lime-300">Player showcase {player.jersey ? `· #${player.jersey}` : ''}</p>
          <h1 id="player-heading" className="mt-2 break-words text-3xl font-black tracking-tight text-white sm:text-4xl">{player.name}</h1>
          {player.fullName && player.fullName !== player.name && <p className="mt-1 text-sm font-medium text-zinc-400">{player.fullName}</p>}
          <p className="mt-2 text-sm font-semibold text-zinc-200">{player.position}</p>
        </div>
        {player.club && href && (
          <Link href={href} prefetch={false} aria-label={`Open ${player.club.name} club profile`} className="tactile group flex w-fit items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 transition-colors hover:border-lime-400/40 focus-visible:outline-2 focus-visible:outline-lime-400">
            <TeamLogo src={player.club.logo} name={player.club.name} size={48} />
            <div><span className="block text-[9px] font-black uppercase tracking-widest text-zinc-400">Current club</span><span className="text-sm font-bold text-white group-hover:text-lime-200">{player.club.name}</span></div>
            <ArrowUpRight className="h-4 w-4 text-lime-300" aria-hidden="true" />
          </Link>
        )}
      </div>
      <dl className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Age">{player.age !== undefined ? `${player.age} years` : 'Not reported'}</Fact>
        <Fact label="Position">{player.position}</Fact>
        <Fact label="Nationality">
          {flag ? <img src={flag} alt="" onError={onFlagError} className="h-4 w-6 shrink-0 rounded-sm object-contain" /> : <Flag className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
          <span>{player.nationality || 'Not reported'}</span>
        </Fact>
        <Fact label="Market value">
          <span>
            {amount || 'Not provided'}
            {value && (
              <span className="mt-1 block text-[10px] font-medium text-zinc-400">
                {historical ? 'Historical' : 'Current'} · {value.asOf.slice(0, 10)}
              </span>
            )}
          </span>
        </Fact>
      </dl>
      {value?.source && <p className="relative mt-3 text-[10px] text-zinc-400">Market value is a dated estimate, not a live valuation or transfer fee. <a href={value.source} target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline underline-offset-2">Valuation source</a></p>}
      {portrait?.kind === 'cutout' && <p className="relative mt-1 text-[10px] text-zinc-400" data-cutout-note="">High-resolution transparent action cutout — no circular crop or opaque backdrop.</p>}
      {portrait?.credit === 'TheSportsDB' && <p className="relative mt-1 text-[10px] text-zinc-400" data-portrait-attribution="">Player image: TheSportsDB.</p>}
    </section>
  );
}
