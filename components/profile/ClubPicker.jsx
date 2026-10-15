'use client';

import { useId, useMemo, useState } from 'react';
import { Loader2, Search, Star, X } from 'lucide-react';
import CrestDrop from '@/components/clubs/CrestDrop';
import { slugifyClubName } from '@/lib/clubs/links';

const clubKey = (club) => String(club?.name || '').trim().toLowerCase();

/**
 * Primary favourite club picker: suggestions come from starred teams and
 * today's fixtures (loaded on first focus); "Search all clubs" resolves any
 * club name through /api/club/{slug}.
 */
export default function ClubPicker({ value, onChange, favorites = [] }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [today, setToday] = useState(null);
  const [lookup, setLookup] = useState({ state: 'idle', club: null });

  const loadToday = async () => {
    if (today !== null) return;
    setToday([]);
    try {
      const response = await fetch('/api/matches');
      const data = response.ok ? await response.json() : null;
      const clubs = [];
      for (const match of data?.matches || []) {
        for (const team of [match?.homeTeam, match?.awayTeam]) {
          if (team?.name) clubs.push({ id: team.id ?? null, name: team.name, badge: team.badge || null });
        }
      }
      setToday(clubs);
    } catch {
      setToday([]);
    }
  };

  const candidates = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const club of [...favorites.map((f) => ({ ...f, starred: true })), ...(today || [])]) {
      const key = clubKey(club);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(club);
    }
    const q = query.trim().toLowerCase();
    return (q ? list.filter((club) => club.name.toLowerCase().includes(q)) : list).slice(0, 8);
  }, [favorites, today, query]);

  const searchAll = async () => {
    const slug = slugifyClubName(query);
    if (!slug) return;
    setLookup({ state: 'loading', club: null });
    try {
      const response = await fetch(`/api/club/${encodeURIComponent(slug)}`);
      const data = response.ok ? await response.json() : null;
      if (!data?.club?.name) throw new Error('not found');
      setLookup({ state: 'done', club: { id: data.club.espnId ?? null, name: data.club.name, badge: data.club.logo || null } });
    } catch {
      setLookup({ state: 'error', club: null });
    }
  };

  const choose = (club) => {
    onChange({ id: club.id ?? null, name: club.name, badge: club.badge || null });
    setQuery('');
    setLookup({ state: 'idle', club: null });
  };

  const options = lookup.club && !candidates.some((c) => clubKey(c) === clubKey(lookup.club)) ? [lookup.club, ...candidates] : candidates;

  return (
    <div className="space-y-3" data-club-picker="">
      {value ? (
        <div className="glass-dark-tile flex items-center gap-3 rounded-2xl p-3">
          <CrestDrop src={value.badge} name={value.name} size="md" tone="dark" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">{value.name}</p>
            <p className="text-[11px] font-semibold text-lime-200">Primary favourite club</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="tactile rounded-xl border border-white/10 p-2 text-zinc-300 hover:border-red-500/40 hover:text-white"
            aria-label={`Remove ${value.name} as favourite club`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-zinc-300">No favourite club yet — pick one below.</p>
      )}

      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search clubs
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={loadToday}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (options[0] && query.trim()) choose(options[0]);
              else searchAll();
            }
          }}
          placeholder="Search starred & today’s clubs…"
          autoComplete="off"
          className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-base text-white placeholder-zinc-400 outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20 sm:text-sm"
        />
      </div>

      {options.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Club suggestions">
          {options.map((club) => {
            const selected = value && clubKey(value) === clubKey(club);
            return (
              <li key={clubKey(club)}>
                <button
                  type="button"
                  onClick={() => choose(club)}
                  aria-pressed={Boolean(selected)}
                  className={`tactile flex w-full min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-xs font-bold ${
                    selected ? 'border-lime-500/60 bg-lime-500/10 text-lime-100' : 'glass-dark-tile glass-dark-tile-hover text-zinc-100'
                  }`}
                >
                  <CrestDrop src={club.badge} name={club.name} size="xs" tone="dark" />
                  <span className="min-w-0 flex-1 truncate">{club.name}</span>
                  {club.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {query.trim().length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={searchAll}
            disabled={lookup.state === 'loading'}
            className="tactile inline-flex items-center gap-1.5 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-1.5 text-xs font-bold text-lime-200 hover:bg-lime-500/20 disabled:opacity-60"
          >
            {lookup.state === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            Search all clubs for “{query.trim()}”
          </button>
          {lookup.state === 'error' && (
            <span role="status" className="text-[11px] font-semibold text-amber-200">
              No club found with that name.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
