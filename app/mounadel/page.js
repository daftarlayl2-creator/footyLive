import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * Custom Admin Dashboard - /mounadel
 * 
 * Protect with login form: Username: mounadel / Password: Riihabtii95@
 * Features inside /mounadel:
 *   a) Add Custom M3U Match Stream
 *   b) Manage Custom Channels
 */

const ADMIN_USERNAME = 'mounadel';
const ADMIN_PASSWORD = 'Riihabtii95@';

// Check if user is authenticated from session
function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check for auth token in localStorage
    const token = localStorage.getItem('eviv_admin_auth');
    if (token === 'true') {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      localStorage.setItem('eviv_admin_auth', 'true');
    } else {
      setError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    localStorage.removeItem('eviv_admin_auth');
  };

  return { authenticated, loggingIn, error, handleLogin, handleLogout };
}

/** Page: Login screen */
function LoginPage({ onAuthChecked }) {
  const { authenticated, loggingIn, error, handleLogin } = useAuth();

  useEffect(() => {
    // Simulate auth check delay
    const timer = setTimeout(() => {
      onAuthChecked();
    }, 500);
    return () => clearTimeout(timer);
  }, [onAuthChecked]);

  if (!authenticated && !loggingIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-8 backdrop-blur-md shadow-2xl max-w-md w-full">
          <h2 className="text-2xl font-extrabold text-navy-800 mb-4">EVIV Live Admin</h2>
          {error && <p className="text-lime-500 mb-4">{error}</p>}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Username
              </label>
              <input
                type="text"
                name="username"
                defaultValue="mounadel"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                defaultValue="Riihabtii95@"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
                readOnly
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-lime-500 px-4 py-2 text-[10px] font-bold text-navy-900 hover:bg-lime-400 transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null; // Auth checked, render protected content
}

/** Page: Admin dashboard (protected) */
function DashboardPage() {
  // Forms state
  const [newStream, setNewStream] = useState({ title: '', kickoff: '', m3u8: '' });
  const [channels, setChannels] = useState([]);

  // Add custom M3U stream
  const addStream = async () => {
    // In production, would save to Supabase
    setNewStream({ title: '', kickoff: '', m3u8: '' });
    // Refresh the list
    loadChannels();
  };

  // Load channels from Supabase
  const loadChannels = async () => {
    // Mock data for now
    setChannels([
      { id: '1', name: 'Test Channel', logo: '', m3u_url: '', is_active: true },
    ]);
  };

  // Add/edit channel
  const toggleChannel = (channel) => {
    const updated = channels.map((c) =>
      c.id === channel.id ? { ...c, is_active: !channel.is_active } : c
    );
    setChannels(updated);
  };

  // Delete channel
  const deleteChannel = (id) => {
    setChannels(channels.filter((c) => c.id !== id));
  };

  return (
    <div className="min-h-screen bg-navy-950/90">
      {/* Header */}
      <header className="border-b border-navy-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-navy-800">
          EVIV Live Admin Panel
        </h1>
        <button
          onClick={() => {
            // Logout
            localStorage.removeItem('eviv_admin_auth');
            window.location.href = '/';
          }}
          className="text-zinc-400 hover:text-lime-400 transition-colors"
        >
          Logout
        </button>
      </header>

      {/* Main content */}
      <main className="p-6">
        {/* Add Custom M3U Stream form */}
        <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-6 mb-6 backdrop-blur-md">
          <h2 className="text-xl font-bold text-navy-800 mb-4">Add Custom M3U Match Stream</h2>
          <form onSubmit={addStream} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Match Title
              </label>
              <input
                value={newStream.title}
                onChange={(e) => setNewStream({ ...newStream, title: e.target.value })}
                placeholder="e.g. Man Utd vs Liverpool - UCL"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
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
                placeholder="e.g. 2024-12-25 20:00 UTC"
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
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
                className="w-full rounded-lg bg-navy-900 border border-navy-700 px-3 py-2 text-zinc-300 focus:outline-none focus:ring-lime-500/30"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-lime-500 px-4 py-2 text-[10px] font-bold text-navy-900 hover:bg-lime-400 transition-colors"
            >
              Add Stream
            </button>
          </form>
        </div>

        {/* Manage Custom Channels */}
        <div className="rounded-2xl border border-navy-700 bg-navy-950/90 p-6 mb-6 backdrop-blur-md">
          <h2 className="text-xl font-bold text-navy-800 mb-4">Manage Custom Channels</h2>
          
          {channels.length === 0 && (
            <p className="text-zinc-500">No channels yet. Add one above.</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-navy-700 text-zinc-400 text-xs font-bold uppercase">
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
                    <td className="p-2 truncated overflow-hidden whitespace-nowrap text-[10px] text-zinc-400">{channel.m3u_url}</td>
                    <td className="p-2">
                      <span
                        className={`rounded bg-${channel.is_active ? 'lime-500/20' : 'navy-700/50'} text-${channel.is_active ? 'lime-400' : 'zinc-400'} text-xs font-bold ${channel.is_active ? 'border-lime-400' : 'border-navy-700/30'} px-2 py-1 ${!channel.is_active ? 'italic' : ''}`}
                      >
                        {channel.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => toggleChannel(channel)}
                        className={`p-1 rounded-md transition-colors ${channel.is_active ? 'text-lime-400 hover:bg-lime-500/20' : 'text-navy-400 hover:bg-navy-900/50'}`}
                        title={channel.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {channel.is_active ? 🔴 : 🟢}
                      </button>
                      <button
                        onClick={() => deleteChannel(channel.id)}
                        className="ml-2 text-red-400 text-xs hover:red-500 transition-colors"
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
        </div>
      </main>
    </div>
  );
}

export default function MounadelPage({ searchParams }) {
  const { authenticated, loggingIn, error, handleLogin, handleLogout } = useAuth();
  
  // Check auth status on mount
  useEffect(() => {
    // Already checked in useAuth effect
  }, []);

  return (
    <div>
      {authenticated ? (
        <DashboardPage />
      ) : (
        <LoginPage onAuthChecked={() => {}} />
      )}
    </div>
  );
}