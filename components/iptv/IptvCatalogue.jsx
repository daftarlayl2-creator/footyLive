'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Play, Search, Star } from 'lucide-react';
import { useLocalValue, writeLocal } from '@/lib/hooks/useLocalValue';
import { IPTV_FAVORITES_KEY, parseFavorites, serializeFavorites, toggleFavorite } from '@/lib/iptv/favorites';
import { searchChannels } from '@/lib/iptv/search';

const PAGE_SIZE = 120;

function ChannelLogo({ logo, name }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) {
    return (
      <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-xs font-black text-navy-600 dark:bg-navy-900 dark:text-zinc-300">
        {(name || 'TV').slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-14 shrink-0 rounded-lg bg-white/90 object-contain p-1"
    />
  );
}

/**
 * Searchable, filterable IPTV catalogue. Favorites persist on this device
 * (same storage pattern as team favorites). Channels arrive server-rendered
 * so the grid is never empty when the catalogue loaded.
 */
export default function IptvCatalogue({ channels, categories, regions, stale }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const favoritesRaw = useLocalValue(IPTV_FAVORITES_KEY);
  const favorites = useMemo(() => parseFavorites(favoritesRaw), [favoritesRaw]);

  const filtered = useMemo(() => {
    let list = channels;
    if (favoritesOnly) list = list.filter((c) => favorites.includes(c.id));
    if (category) list = list.filter((c) => c.category === category);
    if (region) list = list.filter((c) => c.region === region);
    return searchChannels(list, query);
  }, [channels, favoritesOnly, favorites, category, region, query]);

  const visible = filtered.slice(0, shown);

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-col gap-3 rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <span className="sr-only">Search channels</span>
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShown(PAGE_SIZE); }}
              placeholder="Search channels (typos OK)…"
              className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-800 outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-200"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="iptv-category">Category</label>
            <select
              id="iptv-category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setShown(PAGE_SIZE); }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-bold text-zinc-700 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-300"
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sr-only" htmlFor="iptv-region">Region</label>
            <select
              id="iptv-region"
              value={region}
              onChange={(e) => { setRegion(e.target.value); setShown(PAGE_SIZE); }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-bold text-zinc-700 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-300"
            >
              <option value="">All regions</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((v) => !v)}
              className={`tactile inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-extrabold ${favoritesOnly ? 'border-lime-500 bg-lime-500 text-navy-950' : 'border-zinc-200 text-zinc-700 dark:border-navy-750 dark:text-zinc-300'}`}
            >
              <Star className={`h-3.5 w-3.5 ${favoritesOnly ? 'fill-navy-950' : ''}`} aria-hidden="true" />
              Favorites ({favorites.length})
            </button>
          </div>
        </div>
        <p className="text-[11px] font-semibold text-navy-500 dark:text-zinc-400" role="status">
          {filtered.length} of {channels.length} channels{stale ? ' · showing the last verified catalogue (refresh failed)' : ''}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-3xl p-6 text-sm text-navy-700 dark:text-zinc-300">
          <p className="font-bold text-navy-900 dark:text-white">No channels match.</p>
          <p className="mt-1">Try a different search, or clear the category / region / favorites filters.</p>
        </div>
      ) : (
        <>
          <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((channel) => {
              const isFav = favorites.includes(channel.id);
              return (
                <li key={channel.id} className="glass-panel glass-panel-hover relative flex items-center gap-3 rounded-2xl p-3">
                  <ChannelLogo logo={channel.logo} name={channel.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-900 dark:text-zinc-100">{channel.name}</p>
                    <p className="truncate text-[11px] font-semibold text-navy-500 dark:text-zinc-400">
                      {[channel.category, channel.region, channel.quality].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isFav}
                    aria-label={`${isFav ? 'Remove' : 'Add'} ${channel.name} ${isFav ? 'from' : 'to'} favorites`}
                    onClick={() => writeLocal(IPTV_FAVORITES_KEY, serializeFavorites(toggleFavorite(favorites, channel.id)))}
                    className="tactile relative z-10 shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-amber-500"
                  >
                    <Star className={`h-4 w-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden="true" />
                  </button>
                  <Link
                    href={channel.href}
                    aria-label={`Watch ${channel.name}`}
                    className="tactile inline-flex shrink-0 items-center gap-1 rounded-xl bg-lime-500 px-3 py-2 text-[11px] font-extrabold text-navy-950"
                  >
                    <Play className="h-3 w-3 fill-navy-950" aria-hidden="true" /> Watch
                  </Link>
                </li>
              );
            })}
          </ul>
          {shown < filtered.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShown((v) => v + PAGE_SIZE)}
                className="tactile rounded-xl border border-lime-500/40 px-5 py-2.5 text-xs font-extrabold text-lime-600 dark:text-lime-400"
              >
                Show more ({filtered.length - shown} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
