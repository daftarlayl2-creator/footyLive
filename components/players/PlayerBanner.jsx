'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Flag, UserRound } from 'lucide-react';
import TeamLogo from '@/components/clubs/TeamLogo';
import { clubHref } from '@/lib/clubs/links';

function Fact({ label, children }) {
  return <div className="glass-dark-tile min-w-0 rounded-2xl px-4 py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</dt><dd className="mt-1 flex items-center gap-2 text-sm font-extrabold text-white">{children}</dd></div>;
}

export default function PlayerBanner({ player }) {
  const [failedPortrait, setFailedPortrait] = useState(null);
  const [failedFlag, setFailedFlag] = useState(null);
  const href = clubHref(player.club);
  const value = player.marketValue;
  const historical = value && player.updatedAt - Date.parse(value.asOf) > 365 * 86_400_000;
  const amount = value ? new Intl.NumberFormat('en', { style: 'currency', currency: value.currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value.amount) : null;
  return (
    <section className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-8" aria-labelledby="player-heading" data-player-banner="">
      <div className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-lime-400/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-end justify-center overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 to-black/30 shadow-xl sm:h-36 sm:w-36">
          {player.portrait && failedPortrait !== player.portrait
            ? <img src={player.portrait} alt={player.name} onError={() => setFailedPortrait(player.portrait)} className="h-full w-full object-contain object-bottom" />
            : <UserRound className="mb-4 h-20 w-20 text-zinc-400" strokeWidth={1} aria-hidden="true" />}
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
          {player.flag && failedFlag !== player.flag ? <img src={player.flag} alt="" onError={() => setFailedFlag(player.flag)} className="h-4 w-6 shrink-0 rounded-sm object-contain" /> : <Flag className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
          <span>{player.nationality || 'Not reported'}</span>
        </Fact>
        <Fact label="Market value estimate">
          <span>{amount || 'Not provided'}{value && <span className="mt-1 block text-[10px] font-medium text-zinc-400">{historical ? 'Historical estimate' : 'Estimate'} · {value.asOf.slice(0, 10)}</span>}</span>
        </Fact>
      </dl>
      {value?.source && <p className="relative mt-3 text-[10px] text-zinc-400">Market value is a dated estimate, not a live valuation or transfer fee. <a href={value.source} target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline underline-offset-2">Valuation source</a></p>}
    </section>
  );
}
