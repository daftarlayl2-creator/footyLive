'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Star, X } from 'lucide-react';
import ClubLink from '@/components/clubs/ClubLink';
import TeamLogo from '@/components/clubs/TeamLogo';
import CrestDrop from '@/components/clubs/CrestDrop';
import { clubHref } from '@/lib/clubs/links';
import { getFavoriteTeamDetails, toggleFavoriteTeam } from '@/lib/utils/favorites';

function FavoriteCrest({ team }) {
  const [resolved, setResolved] = useState(null);
  // Legacy name-only favorites still get their crest when no fixture is listed.
  useEffect(() => {
    if (team.badge) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(`/api/club/${clubHref(team)?.split('/').pop()}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted && data?.club) setResolved({ ...team, id: data.club.espnId, badge: data.club.logo }); })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [team]);
  const club = resolved || team;
  return (
    <ClubLink team={club} prefetch={false} aria-label={`Open ${team.name} club profile`} className="tactile flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 hover:bg-lime-500/10">
      <CrestDrop src={club.badge} name={club.name} size={50} />
      <span className="w-full truncate text-center text-[10px] font-bold">{team.name}</span>
    </ClubLink>
  );
}

/** A viewport-sticky, horizontal favorites shelf. Crests open the club's fixtures. */
export default function FavoritesHub({ favorites, matches }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [details, setDetails] = useState({});
  useEffect(() => {
    const sync = () => setDetails(getFavoriteTeamDetails());
    sync();
    window.addEventListener('favorites-updated', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('favorites-updated', sync); window.removeEventListener('storage', sync); };
  }, []);
  const teams = useMemo(() => {
    const all = new Map();
    for (const match of matches) {
      for (const team of [match.homeTeam, match.awayTeam]) {
        if (team?.name) all.set(team.name.toLowerCase(), team);
      }
    }
    return all;
  }, [matches]);
  const starred = useMemo(() => favorites.map((name) => teams.get(name.toLowerCase()) || details[name.toLowerCase()] || { name }), [favorites, teams, details]);
  const options = [...teams.values()].filter((team) => team.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section aria-label="Favorite teams hub" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-40 rounded-3xl border border-lime-500/20 bg-white/95 p-2 shadow-lg backdrop-blur-xl dark:bg-navy-950/95">
      <div className="flex items-center gap-2 px-2 pt-1 text-[10px] font-extrabold uppercase tracking-widest text-navy-500 dark:text-zinc-400"><Star className="h-3 w-3 text-amber-400" aria-hidden="true" /> Your favorites <span className="ml-auto font-medium normal-case tracking-normal">Tap a crest to explore</span></div>
      <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain py-1" tabIndex={0} aria-label="Favorite club crests">
        {starred.map((team) => <FavoriteCrest key={team.name} team={team} />)}
        <button type="button" aria-expanded={adding} aria-controls="favorite-team-picker" onClick={() => setAdding(!adding)} className="tactile mx-1 flex shrink-0 items-center gap-2 rounded-2xl border border-dashed border-lime-500/40 bg-lime-500/5 px-4 py-4 text-xs font-bold text-lime-700 dark:text-lime-400">
          <Plus className="h-5 w-5" aria-hidden="true" /> {starred.length ? 'Add teams' : 'Add Favorite Teams'}
        </button>
      </div>
      {adding && (
        <div id="favorite-team-picker" className="space-y-3 border-t border-navy-200 p-3 dark:border-navy-750">
          <div className="flex items-center gap-2">
            <input autoFocus aria-label="Find favorite teams" placeholder="Search today’s teams…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-navy-200 bg-transparent p-2 text-sm dark:border-navy-750" />
            <button type="button" aria-label="Close team picker" onClick={() => setAdding(false)} className="tactile rounded-xl p-2"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {options.map((team) => {
              const selected = favorites.some((name) => name.toLowerCase() === team.name.toLowerCase());
              return <button key={team.name} type="button" aria-pressed={selected} onClick={() => toggleFavoriteTeam(team)} className="tactile flex min-w-0 items-center gap-2 rounded-xl border border-navy-200 p-2 text-left text-xs font-bold dark:border-navy-750"><TeamLogo src={team.badge} name={team.name} size={28} /><span className="flex-1 truncate">{team.name}</span><Star className={`h-4 w-4 shrink-0 ${selected ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'}`} /></button>;
            })}
            {!options.length && <p className="text-xs text-zinc-600 dark:text-zinc-400">No matching teams in today’s fixtures. Star a team on a match card when it appears.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
