'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { MAX_DISPLAY_NAME_LENGTH, MIN_PASSWORD_LENGTH, signIn, signUp } from '@/lib/auth';
import { MAX_NICKNAME_LENGTH, NICKNAME_STORAGE_KEY, sanitizeNickname } from '@/lib/chat';
import { writeLocal } from '@/lib/hooks/useLocalValue';
import { playSound } from '@/lib/sound/uiSound';
import VerifiedBadge from '@/components/auth/VerifiedBadge';

const INPUT =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white placeholder-zinc-400 outline-none focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/20 sm:text-sm';
const LABEL = 'text-[11px] font-extrabold uppercase tracking-wider text-zinc-200';

/** Guest → registered: create an account or sign in (Supabase Auth or device-local). */
export default function AuthPanel({ provider, guestName }) {
  const ids = { name: useId(), email: useId(), password: useId(), nickname: useId() };
  const [mode, setMode] = useState('signup');
  const [form, setForm] = useState({ displayName: guestName || '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nickname, setNickname] = useState(guestName || '');
  const [nicknameSaved, setNicknameSaved] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const result = mode === 'signup' ? await signUp(form) : await signIn(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      playSound('error');
      return;
    }
    if (result.needsConfirmation) {
      setNotice(result.notice || 'Check your inbox to confirm your email, then sign in.');
      setMode('signin');
      setForm((current) => ({ ...current, password: '' }));
      return;
    }
    playSound('success');
  };

  const saveNickname = (event) => {
    event.preventDefault();
    const clean = sanitizeNickname(nickname);
    if (!clean) return;
    writeLocal(NICKNAME_STORAGE_KEY, clean);
    setNickname(clean);
    setNicknameSaved(true);
    playSound('success');
  };

  return (
    <section className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-labelledby="auth-heading" data-auth-panel="">
      <span className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" aria-hidden="true" />

      <h2 id="auth-heading" className="relative flex items-center gap-2 text-base font-extrabold text-white">
        Join EVIV Live
        <VerifiedBadge size={18} />
      </h2>
      <p className="relative mt-0.5 text-[11px] font-semibold text-zinc-300">
        Registered fans get the blue verified badge in chat and on their profile.
      </p>

      <div role="tablist" aria-label="Account" className="relative mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/25 p-1">
        {[
          { key: 'signup', label: 'Create account', icon: UserPlus },
          { key: 'signin', label: 'Sign in', icon: LogIn },
        ].map((tab) => {
          const Icon = tab.icon;
          const selected = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchMode(tab.key)}
              className={`tactile inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold ${
                selected ? 'bg-lime-500 text-navy-950 shadow-glow-lime' : 'text-zinc-200 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="relative mt-4 space-y-3" noValidate>
        {mode === 'signup' && (
          <div>
            <label htmlFor={ids.name} className={LABEL}>
              Display name
            </label>
            <input
              id={ids.name}
              value={form.displayName}
              onChange={update('displayName')}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="nickname"
              placeholder="How fans will see you"
              required
              className={INPUT}
            />
          </div>
        )}
        <div>
          <label htmlFor={ids.email} className={LABEL}>
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            inputMode="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            placeholder="you@example.com"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor={ids.password} className={LABEL}>
            Password
          </label>
          <div className="relative">
            <input
              id={ids.password}
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={update('password')}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters, with a number` : 'Your password'}
              required
              className={`${INPUT} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((on) => !on)}
              className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-lg p-1.5 text-zinc-300 hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl border border-sky-400/35 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="lime-cta tactile inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {mode === 'signup' ? 'Create my account' : 'Sign in'}
        </button>

        <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-relaxed text-zinc-300">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-300" aria-hidden="true" />
          {provider === 'supabase'
            ? 'Secured by Supabase Auth — your account works on every device.'
            : 'Your account is stored on this device with a salted, hashed password. Connect Supabase to sync accounts across devices.'}
        </p>
      </form>

      {/* Guest identity */}
      <form onSubmit={saveNickname} className="relative mt-5 border-t border-white/10 pt-4">
        <label htmlFor={ids.nickname} className={LABEL}>
          Or keep chatting as a guest
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={ids.nickname}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              setNicknameSaved(false);
            }}
            maxLength={MAX_NICKNAME_LENGTH}
            placeholder="Guest nickname"
            className={`${INPUT} mt-0`}
          />
          <button type="submit" className="tactile shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-100 hover:border-lime-500/40">
            {nicknameSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
