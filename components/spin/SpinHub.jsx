'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Clock, Crown, Gift, LogIn, Trophy } from 'lucide-react';
import LemonWheel from './LemonWheel';
import ErrorBoundary from '@/components/ErrorBoundary';
import EvivCoin from '@/components/coins/EvivCoin';
import { useAuth } from '@/lib/auth';
import { playSound } from '@/lib/sound/uiSound';
import { findSpinPrize } from '@/lib/spin/prizes';

/** Countdown text for the cooldown pill (ticks only while the tab is visible). */
function formatLeft(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Daily Lemon Wheel hub: one spin every 24 hours for registered fans, prizes
 * from 100 to 5,000 Limon Coins or a 24-hour VIP pass. The draw and the
 * cooldown are server-side (`/api/spin`); this component animates to the
 * segment the server returned and shows the receipts of recent wins.
 */
export default function SpinHub() {
  const auth = useAuth();
  const registered = auth.status === 'authenticated' && Boolean(auth.user);

  const [status, setStatus] = useState(null);
  const [catalog, setCatalog] = useState({ prizes: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [won, setWon] = useState(null);
  const [left, setLeft] = useState(0);
  const loadingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch('/api/spin', { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) {
        setStatus(data);
        setCatalog({ prizes: data.prizes || [] });
        setLeft(data.canSpin ? 0 : Math.max(0, (data.nextSpinAt || 0) - Date.now()));
      }
    } catch {
      /* offline: the wheel stays interactive-disabled with a retry */
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(loadStatus, 0);
    return () => clearTimeout(initial);
  }, [loadStatus]);

  // Cooldown countdown — visible time only, always cleaned up.
  useEffect(() => {
    if (!status || status.canSpin) return undefined;
    const tick = () => {
      if (document.hidden) return;
      setLeft(Math.max(0, (status.nextSpinAt || 0) - Date.now()));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status]);

  const spin = async () => {
    if (busy || !registered) return;
    setBusy(true);
    setError('');
    setWon(null);
    playSound('toggle');
    try {
      const response = await fetch('/api/spin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: auth.user?.name || auth.user?.email || 'fan' }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setError(data.error || 'The wheel could not spin right now.');
        if (data.status) setStatus(data.status);
        if (data.nextSpinAt) setLeft(Math.max(0, data.nextSpinAt - Date.now()));
        return;
      }
      setWon(data.prize);
      setStatus(data);
      setLeft(Math.max(0, (data.nextSpinAt || 0) - Date.now()));
      playSound('success');
      if (typeof window !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([18, 60, 26]);
    } catch {
      setError('Network hiccup — the wheel did not spin. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const canSpinNow = Boolean(status?.canSpin) && registered && !busy;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" data-spin-hub={auth.status}>
      {/* Hero */}
      <header className="glass-panel relative overflow-hidden rounded-3xl p-6 text-center sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(204,255,0,0.14),transparent_60%)]" aria-hidden="true" />
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-lime-700 dark:text-lime-300">Daily Lemon Wheel</p>
        <h1 className="mt-2 text-3xl font-black text-navy-900 dark:text-white">Spin once a day. Win coins or VIP.</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-navy-500 dark:text-zinc-400">
          Registered fans get one free spin every 24 hours. Land anywhere from <strong className="text-lime-700 dark:text-lime-300">100 to 5,000 Limon Coins</strong> — or the
          <strong className="text-lime-700 dark:text-lime-300"> 24-hour VIP pass</strong> with ad-free FHD streams and Multi-View. Prizes are drawn on the server and credited instantly to your wallet.
        </p>
      </header>

      {/* Wheel + side panel */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="glass-panel flex flex-col items-center gap-5 rounded-3xl p-6 sm:p-8">
          {auth.status === 'loading' ? (
            <div className="flex h-[360px] items-center justify-center text-sm font-bold text-zinc-400">Checking your account…</div>
          ) : !registered ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-4 text-center">
              <LogIn className="h-9 w-9 text-lime-400" aria-hidden="true" />
              <p className="max-w-sm text-sm font-semibold text-zinc-300">
                The Lemon Wheel is for registered fans. Create your free account — it takes a minute — and come back for your daily spin.
              </p>
              <Link href="/profile" className="lime-cta tactile inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in / Create account
              </Link>
            </div>
          ) : (
            <>
              <LemonWheel onSpin={spin} disabled={!canSpinNow} spinning={busy} resultPrizeId={won?.id ?? null} />

              {!status?.canSpin && status && (
                <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-200" data-spin-cooldown="">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Wheel recharges in <span className="font-mono tabular-nums">{formatLeft(left)}</span>
                </p>
              )}

              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-200">{error}</p>}

              {won && (
                <div role="status" className="w-full max-w-sm rounded-2xl border border-lime-400/40 bg-lime-500/10 p-5 text-center shadow-[0_0_36px_rgba(204,255,0,0.22)]" data-spin-result="">
                  {won.kind === 'vip' ? (
                    <Crown className="mx-auto h-8 w-8 text-lime-300" aria-hidden="true" />
                  ) : (
                    <EvivCoin size={44} burst />
                  )}
                  <p className="mt-3 text-lg font-black text-white">{won.label}</p>
                  <p className="mt-1 text-xs text-zinc-300">
                    {won.kind === 'vip'
                      ? 'Your 24-hour VIP pass is live — ad-free FHD/4K and Multi-View are unlocked.'
                      : 'Credited to your Limon Coin wallet on the server.'}
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Link href="/profile#rewards" className="tactile rounded-xl border border-lime-400/30 px-3 py-2 text-[11px] font-bold text-lime-200">Open wallet</Link>
                    {won.kind === 'vip' && <Link href="/multistream" className="tactile rounded-xl border border-lime-400/30 px-3 py-2 text-[11px] font-bold text-lime-200">Try Multi-View</Link>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Side: rules + recent wins */}
        <aside className="flex flex-col gap-4">
          <div className="glass-panel rounded-3xl p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-300">
              <Trophy className="h-3.5 w-3.5 text-lime-500" aria-hidden="true" />
              What you can win
            </h2>
            <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
              {(catalog.prizes.length ? catalog.prizes : []).map((prize) => (
                <li key={prize.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="flex items-center gap-2 font-bold text-zinc-800 dark:text-zinc-100">
                    {prize.kind === 'vip' ? <Crown className="h-3.5 w-3.5 text-lime-400" aria-hidden="true" /> : <EvivCoin size={14} spin={false} sparkle={false} />}
                    {prize.label}
                  </span>
                  <span className="rounded-full bg-lime-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-lime-700 dark:text-lime-300">{prize.rarity}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-panel rounded-3xl p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-300">
              <CalendarClock className="h-3.5 w-3.5 text-lime-500" aria-hidden="true" />
              Your recent spins
            </h2>
            {(status?.history || []).length ? (
              <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                {status.history.slice(0, 5).map((row) => {
                  const prize = findSpinPrize(row.prizeId);
                  return (
                    <li key={`${row.prizeId}-${row.at}`} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">{prize?.label || row.prizeId}</span>
                      <span className="tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">{new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">No spins yet — your wins will be listed here.</p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
              <Gift className="h-3 w-3" aria-hidden="true" />
              One spin every 24 hours · prizes settle on the server
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Error-isolated wrapper used by /spin. */
export function SpinHubSafe() {
  return (
    <ErrorBoundary name="spin-wheel" title="Lemon Wheel hit a snag" message="The wheel could not be mounted right now. Your daily spin is saved — try again in a moment.">
      <SpinHub />
    </ErrorBoundary>
  );
}
