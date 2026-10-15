'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase';

/**
 * Custom Admin Dashboard - /mounadel
 *
 * Protected by server-side session authentication (/api/admin/auth).
 * Credentials are verified exclusively on the server and never shipped in the
 * client bundle.
 *
 * Features inside /mounadel:
 *   a) Add Custom M3U Match Stream
 *   b) Manage Custom Channels
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
      <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-8 backdrop-blur-md shadow-2xl max-w-md w-full">
        <h2 className="text-2xl font-extrabold text-zinc-100 mb-1">EVIV Live Admin</h2>
        <p className="text-xs text-zinc-400 mb-5">Sign in with your administrator credentials to manage streams and channels.</p>
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
              className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
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
              className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-lg bg-lime-500 px-4 py-2 text-xs font-bold text-navy-900 hover:bg-lime-400 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loggingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const INITIAL_CHANNELS = [
  { id: '1', name: 'beIN Sports 1 HD', logo: '', m3u_url: 'https://live.eviv.tv/hls/bein1.m3u8', is_active: true },
];

/** Page: Admin dashboard (protected) */
function DashboardPage({ onLogout }) {
  const { supabase, isMockMode } = useSupabase();
  const [newStream, setNewStream] = useState({ title: '', kickoff: '', m3u8: '' });
  const [customStreams, setCustomStreams] = useState([]);
  const [channels, setChannels] = useState(INITIAL_CHANNELS);

  useEffect(() => {
    if (!supabase || isMockMode) return;
    let cancelled = false;
    supabase
      .from('custom_channels')
      .select('*')
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setChannels(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supabase, isMockMode]);

  // Add custom M3U stream
  const addStream = async (e) => {
    e.preventDefault();
    const created = {
      id: `stream-${Date.now()}`,
      match_title: newStream.title.trim(),
      kickoff_time: newStream.kickoff.trim(),
      m3u8_url: newStream.m3u8.trim(),
    };
    if (supabase && !isMockMode) {
      await supabase.from('custom_streams').insert(created).catch(() => {});
    }
    setCustomStreams((prev) => [created, ...prev]);
    setChannels((prev) => [
      {
        id: created.id,
        name: created.match_title,
        logo: '',
        m3u_url: created.m3u8_url,
        is_active: true,
      },
      ...prev,
    ]);
    setNewStream({ title: '', kickoff: '', m3u8: '' });
  };

  // Add/edit channel
  const toggleChannel = (channel) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === channel.id ? { ...c, is_active: !c.is_active } : c))
    );
  };

  // Delete channel
  const deleteChannel = (id) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="min-h-screen bg-navy-950/90 rounded-2xl border border-navy-750 overflow-hidden">
      {/* Header */}
      <header className="border-b border-navy-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-zinc-100">
          EVIV Live Admin Panel
        </h1>
        <button
          type="button"
          onClick={onLogout}
          className="cursor-pointer rounded-lg border border-navy-700 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-lime-500/40 hover:text-lime-400"
        >
          Logout
        </button>
      </header>

      {/* Main content */}
      <main className="p-6 space-y-6">
        {/* Add Custom M3U Stream form */}
        <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-6 backdrop-blur-md">
          <h2 className="text-xl font-bold text-zinc-100 mb-4">Add Custom M3U Match Stream</h2>
          <form onSubmit={addStream} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Match Title
              </label>
              <input
                value={newStream.title}
                onChange={(e) => setNewStream({ ...newStream, title: e.target.value })}
                placeholder="e.g. Man Utd vs Liverpool - UCL"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Kickoff Time
              </label>
              <input
                value={newStream.kickoff}
                onChange={(e) => setNewStream({ ...newStream, kickoff: e.target.value })}
                placeholder="e.g. 2026-10-15 20:00 UTC"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                M3U8 Stream URL
              </label>
              <input
                value={newStream.m3u8}
                onChange={(e) => setNewStream({ ...newStream, m3u8: e.target.value })}
                placeholder="e.g. https://example.com/stream.m3u8"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-lime-500 px-4 py-2 text-xs font-bold text-navy-900 hover:bg-lime-400 transition-colors cursor-pointer"
            >
              Add Stream
            </button>
          </form>

          {customStreams.length > 0 && (
            <div className="mt-4 pt-4 border-t border-navy-800 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-lime-400">Recently Added Match Streams</p>
              {customStreams.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs bg-navy-900/60 rounded-lg px-3 py-2 border border-navy-800">
                  <span className="font-bold text-zinc-200">{s.match_title}</span>
                  <span className="text-zinc-400">{s.kickoff_time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manage Custom Channels */}
        <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-6 backdrop-blur-md">
          <h2 className="text-xl font-bold text-zinc-100 mb-4">Manage Custom Channels</h2>

          {channels.length === 0 ? (
            <p className="text-zinc-500 text-sm">No channels yet. Add one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-navy-700 text-zinc-400 text-xs font-bold uppercase text-left">
                    <th className="p-2">Channel</th>
                    <th className="p-2">Logo</th>
                    <th className="p-2">M3U URL</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className="hover:bg-navy-900/50">
                      <td className="p-2 font-medium text-zinc-200">{channel.name}</td>
                      <td className="p-2">
                        {channel.logo ? (
                          <img
                            src={channel.logo}
                            alt={channel.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-zinc-500 text-xs">No logo</span>
                        )}
                      </td>
                      <td className="p-2 truncate overflow-hidden whitespace-nowrap text-[11px] text-zinc-400">
                        {channel.m3u_url}
                      </td>
                      <td className="p-2">
                        <span
                          className={`rounded text-xs font-bold px-2 py-1 ${
                            channel.is_active
                              ? 'bg-lime-500/20 text-lime-400 border-lime-400'
                              : 'bg-navy-700/50 text-zinc-400 border-navy-700/30 italic'
                          }`}
                        >
                          {channel.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => toggleChannel(channel)}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            channel.is_active
                              ? 'text-lime-400 hover:bg-lime-500/20'
                              : 'text-navy-400 hover:bg-navy-900/50'
                          }`}
                          title={channel.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {channel.is_active ? '🔴' : '🟢'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChannel(channel.id)}
                          className="ml-2 text-red-400 text-xs hover:text-red-500 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
