'use client';

import { useId, useRef, useState } from 'react';
import { Cake, Camera, Check, ImageOff, Loader2, Save } from 'lucide-react';
import { AVATAR_PRESETS, MAX_DISPLAY_NAME_LENGTH, resizeImageToDataUrl, updateProfile } from '@/lib/auth';
import { playSound } from '@/lib/sound/uiSound';
import { COUNTRIES, ageFromBirthdate, normalizeCountryCode } from '@/lib/geo/countries';
import UserAvatar from '@/components/auth/UserAvatar';
import ClubPicker from './ClubPicker';
import WavingFlag from './WavingFlag';

function sameClub(a, b) {
  return (a?.name || '') === (b?.name || '') && String(a?.id ?? '') === String(b?.id ?? '');
}

/** Date input bounds: youngest fan 5, oldest 120 (server-side rule mirrors it). */
function birthdateBounds() {
  const now = new Date();
  const iso = (year) => `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { min: iso(now.getFullYear() - 120), max: iso(now.getFullYear() - 5) };
}

/** Edit display name, avatar picture (upload or brand preset), fan identity (birthdate + country) and primary favourite club. */
export default function ProfileEditor({ user, favorites }) {
  const nameId = useId();
  const birthdateId = useId();
  const countryId = useId();
  const fileRef = useRef(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarCategory, setAvatarCategory] = useState('all');
  const [avatarSearch, setAvatarSearch] = useState('');
  const [club, setClub] = useState(user.favoriteClub);
  const [birthdate, setBirthdate] = useState(user.birthdate || '');
  const [countryCode, setCountryCode] = useState(normalizeCountryCode(user.countryCode) || '');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle', message: '' });

  const savedCountry = normalizeCountryCode(user.countryCode) || '';
  const dirty =
    displayName !== user.displayName ||
    avatarUrl !== user.avatarUrl ||
    !sameClub(club, user.favoriteClub) ||
    (birthdate || '') !== (user.birthdate || '') ||
    countryCode !== savedCountry;
  const age = ageFromBirthdate(birthdate);
  const bounds = birthdateBounds();

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProcessing(true);
    try {
      setAvatarUrl(await resizeImageToDataUrl(file));
      setStatus({ kind: 'idle', message: '' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'That image could not be used.' });
    } finally {
      setProcessing(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const patch = {};
    if (displayName !== user.displayName) patch.displayName = displayName;
    if (avatarUrl !== user.avatarUrl) patch.avatarUrl = avatarUrl;
    if (!sameClub(club, user.favoriteClub)) patch.favoriteClub = club;
    if ((birthdate || '') !== (user.birthdate || '')) patch.birthdate = birthdate || null;
    if (countryCode !== savedCountry) patch.countryCode = countryCode || null;
    if (!Object.keys(patch).length) return;

    setStatus({ kind: 'saving', message: 'Saving…' });
    const result = await updateProfile(patch);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      playSound('error');
      return;
    }
    if (result.user) {
      setDisplayName(result.user.displayName);
      setAvatarUrl(result.user.avatarUrl);
      setClub(result.user.favoriteClub);
      setBirthdate(result.user.birthdate || '');
      setCountryCode(normalizeCountryCode(result.user.countryCode) || '');
    }
    setStatus({ kind: 'saved', message: result.notice || 'Profile saved' });
    playSound('success');
  };

  return (
    <form onSubmit={save} className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-labelledby="profile-editor-heading" data-profile-editor="">
      <h2 id="profile-editor-heading" className="text-base font-extrabold text-white">
        Edit profile
      </h2>
      <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">Your name and picture appear in chat with your verified badge.</p>

      {/* Display name */}
      <div className="mt-5">
        <label htmlFor={nameId} className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">
          Display name
        </label>
        <input
          id={nameId}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoComplete="nickname"
          required
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white placeholder-zinc-400 outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20 sm:text-sm"
        />
        <p className="mt-1 text-right text-[10px] font-semibold tabular-nums text-zinc-400">
          {displayName.length}/{MAX_DISPLAY_NAME_LENGTH}
        </p>
      </div>

      {/* Avatar */}
      <fieldset className="mt-3">
        <legend className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">Avatar picture</legend>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <UserAvatar name={displayName || user.displayName} avatarUrl={avatarUrl} size={72} verified={user.verified} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onFile} tabIndex={-1} aria-hidden="true" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className="tactile inline-flex items-center gap-1.5 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-xs font-bold text-lime-200 hover:bg-lime-500/20 disabled:opacity-60"
            >
              {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
              Upload photo
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="tactile inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-red-500/40 hover:text-white"
              >
                <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </button>
            )}
          </div>
        </div>
        {/* Expanded 100+ Avatars Gallery */}
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Cyberpunk & Limon Gallery ({AVATAR_PRESETS.length} presets)
            </span>
            <input
              type="text"
              value={avatarSearch}
              onChange={(e) => setAvatarSearch(e.target.value)}
              placeholder="Filter avatars…"
              aria-label="Filter avatar presets"
              className="rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-eviv-lime/50 w-32 sm:w-40"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Avatar categories">
            {[
              { id: 'all', label: `All (${AVATAR_PRESETS.length})` },
              { id: 'lemon', label: '🍋 Citrus' },
              { id: 'cyberpunk', label: '🤖 Cyberpunk' },
              { id: 'football', label: '⚽ Football' },
              { id: 'beast', label: '🦁 Beasts' },
              { id: 'neon', label: '⚡ Neon' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAvatarCategory(tab.id)}
                className={`tactile px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                  avatarCategory === tab.id
                    ? 'bg-eviv-lime text-[#18030A]'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="mt-2 flex flex-wrap gap-2 max-h-56 overflow-y-auto p-2 rounded-2xl bg-black/30 border border-white/10 scrollbar-thin"
            role="group"
            aria-label="Brand avatars"
          >
            {AVATAR_PRESETS.filter((preset) => {
              if (avatarCategory !== 'all' && preset.category !== avatarCategory) return false;
              if (avatarSearch && !preset.label.toLowerCase().includes(avatarSearch.toLowerCase())) return false;
              return true;
            }).map((preset) => {
              const value = `preset:${preset.id}`;
              const active = avatarUrl === value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAvatarUrl(value)}
                  aria-label={`Use the ${preset.label} avatar`}
                  aria-pressed={active}
                  title={preset.label}
                  className={`tactile relative rounded-full p-0.5 transition ${
                    active ? 'ring-2 ring-lime-400 scale-105' : 'ring-1 ring-white/10 hover:ring-lime-500/50 hover:scale-105'
                  }`}
                >
                  <UserAvatar name={preset.label} avatarUrl={value} size={38} ring={false} />
                  {active && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-lime-500 text-navy-950">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      {/* Fan identity: birthdate + country (waving flag next to the username) */}
      <fieldset className="mt-5" data-fan-identity="">
        <legend className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">Fan identity</legend>
        <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">Your age and flag wave next to your name on this profile.</p>
        <div className="mt-2.5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={birthdateId} className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">Birthdate</label>
            <div className="relative mt-1.5">
              <input
                id={birthdateId}
                type="date"
                value={birthdate}
                min={bounds.min}
                max={bounds.max}
                onChange={(event) => setBirthdate(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 pr-9 text-base text-white [color-scheme:dark] outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20 sm:text-sm"
              />
              <Cake className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lime-300" aria-hidden="true" />
            </div>
            <p className="mt-1 text-[10px] font-semibold text-zinc-400" aria-live="polite">
              {birthdate
                ? age !== null
                  ? `${age} years old`
                  : 'Pick a real date'
                : 'Optional · never shown publicly'}
            </p>
          </div>
          <div>
            <label htmlFor={countryId} className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">Country</label>
            <div className="mt-1.5 flex items-center gap-2.5">
              <select
                id={countryId}
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white [color-scheme:dark] outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20 sm:text-sm"
              >
                <option value="">No country yet</option>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
              <WavingFlag code={countryCode || 'MA'} size={30} className={countryCode ? '' : 'opacity-30 grayscale'} />
            </div>
            <p className="mt-1 text-[10px] font-semibold text-zinc-400">The flag waves next to your name.</p>
          </div>
        </div>
      </fieldset>

      {/* Favourite club */}
      <fieldset className="mt-5">
        <legend className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">Primary favourite club</legend>
        <ClubPicker value={club} onChange={setClub} favorites={favorites} />
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`min-h-[1.25rem] text-xs font-semibold ${
            status.kind === 'error' ? 'text-red-300' : status.kind === 'saved' ? 'text-lime-200' : 'text-zinc-300'
          }`}
        >
          {status.message || (dirty ? 'Unsaved changes' : '')}
        </p>
        <button
          type="submit"
          disabled={!dirty || status.kind === 'saving' || processing}
          className="lime-cta tactile inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status.kind === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Save profile
        </button>
      </div>
    </form>
  );
}
