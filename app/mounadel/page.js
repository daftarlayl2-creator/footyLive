'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command, Crown, Landmark, ListVideo, ShieldCheck, UsersRound } from 'lucide-react';
import CommandTab from '@/components/admin/CommandTab';
import UsersTab from '@/components/admin/UsersTab';
import FinanceTab from '@/components/admin/FinanceTab';
import StreamsManager from '@/components/admin/StreamsManager';

/**
 * /mounadel — Limon Live ultra-premium admin command center.
 *
 * Protected by the signed server-side session (/api/admin/auth): credentials
 * are verified exclusively on the server and never shipped in the bundle.
 *
 * Tabs:
 *   Command → live visitors, ad impressions, CTR, 14-day trend, finance rollups
 *   Users   → viewer registry with one-click Ban/Unban + EVIV Coin adjustments
 *   Finance → subscription ledger (pass purchases, coin redemptions, adjustments)
 *   Streams → custom M3U streams + channel pool management
 */

function useAuth() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/auth', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAuthenticated(Boolean(data?.authenticated));
      })
      .catch(() => {
        if (cancelled) return;
        setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setError('');
    const formData = new FormData(e.currentTarget);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.authenticated) {
        setAuthenticated(true);
      } else {
        setError(data?.error || 'Invalid username or password');
      }
    } catch {
      setError('Unable to reach authentication server');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } catch {
      // Proceed with client state reset even if network fails.
    }
    setAuthenticated(false);
    router.push('/');
  };

  return { authenticated, checkingSession, loggingIn, error, handleLogin, handleLogout };
}

/** Page: Login screen. Auth state lives in the page so a successful login swaps in the dashboard. */
function LoginPage({ loggingIn, error, handleLogin }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="vip-glass vip-hero-enter rounded-2xl p-8 max-w-md w-full">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-eviv-lime">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Command Center
        </p>
        <h2 className="text-2xl font-extrabold text-zinc-100 mt-2 mb-1">Limon Live Admin</h2>
        <p className="text-xs text-zinc-400 mb-5">Sign in with your administrator credentials to run the platform.</p>
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 mb-4">
            {error}
          </p>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-username" className="block text-sm font-medium text-zinc-300 mb-1">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Enter admin username"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-zinc-300 mb-1">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter admin password"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loggingIn}
            className="lime-cta tactile w-full rounded-lg px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-60"
          >
            {loggingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'command', label: 'Command', icon: Command, Component: CommandTab },
  { id: 'users', label: 'Users', icon: UsersRound, Component: UsersTab },
  { id: 'finance', label: 'Finance', icon: Landmark, Component: FinanceTab },
  { id: 'streams', label: 'Streams', icon: ListVideo, Component: StreamsManager },
];

/** Page: Admin dashboard shell (protected). */
function DashboardPage({ onLogout }) {
  const [tab, setTab] = useState('command');
  const active = TABS.find((row) => row.id === tab) || TABS[0];
  const ActiveComponent = active.Component;

  return (
    <div className="min-h-screen rounded-2xl border border-white/10 bg-[#18030A]/90 overflow-hidden" data-admin-dashboard="">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 sm:px-6 py-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-eviv-lime">
            <Crown className="h-4 w-4" aria-hidden="true" />
            Limon Live
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">Admin Command Center</h1>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="tactile cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-eviv-lime/40 hover:text-eviv-lime"
        >
          Logout
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-3 sm:px-6 py-2.5" aria-label="Admin sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`admin-tab tactile inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-black uppercase tracking-wide ${
              tab === id
                ? 'border-eviv-lime/50 bg-eviv-lime/15 text-eviv-lime'
                : 'border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5 hover:text-zinc-100'
            }`}
            data-admin-tab={id}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Active panel (all tabs stay mounted=false — fresh data per switch) */}
      <main className="p-4 sm:p-6" key={active.id}>
        <ActiveComponent />
      </main>
    </div>
  );
}

export default function MounadelPage() {
  const { authenticated, checkingSession, loggingIn, error, handleLogin, handleLogout } = useAuth();

  if (checkingSession) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-8 text-xs font-bold uppercase tracking-widest text-zinc-400">
        Verifying session…
      </div>
    );
  }

  return (
    <div>
      {authenticated ? (
        <DashboardPage onLogout={handleLogout} />
      ) : (
        <LoginPage loggingIn={loggingIn} error={error} handleLogin={handleLogin} />
      )}
    </div>
  );
}
