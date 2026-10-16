'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase';

const INITIAL_CHANNELS = [
  { id: '1', name: 'beIN Sports 1 HD', logo: '', m3u_url: 'https://live.eviv.tv/hls/bein1.m3u8', is_active: true },
];

/**
 * /mounadel → Streams tab: add custom M3U match streams and manage the custom
 * channel pool (activate/deactivate/delete). Kept from the original panel —
 * the command center wraps it with tabs.
 */
export default function StreamsManager() {
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

  const toggleChannel = (channel) => {
    setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, is_active: !c.is_active } : c)));
  };

  const deleteChannel = (id) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Add Custom M3U Stream form */}
      <div className="vip-glass rounded-2xl p-6">
        <h2 className="text-xl font-bold text-zinc-100 mb-4">Add Custom M3U Match Stream</h2>
        <form onSubmit={addStream} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Match Title</label>
            <input
              value={newStream.title}
              onChange={(e) => setNewStream({ ...newStream, title: e.target.value })}
              placeholder="e.g. Man Utd vs Liverpool - UCL"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Kickoff Time</label>
            <input
              value={newStream.kickoff}
              onChange={(e) => setNewStream({ ...newStream, kickoff: e.target.value })}
              placeholder="e.g. 2026-10-15 20:00 UTC"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">M3U8 Stream URL</label>
            <input
              value={newStream.m3u8}
              onChange={(e) => setNewStream({ ...newStream, m3u8: e.target.value })}
              placeholder="e.g. https://example.com/stream.m3u8"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
              required
            />
          </div>
          <button type="submit" className="lime-cta tactile w-full rounded-lg px-4 py-2 text-xs font-bold cursor-pointer">
            Add Stream
          </button>
        </form>

        {customStreams.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-eviv-lime">Recently Added Match Streams</p>
            {customStreams.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-black/30 rounded-lg px-3 py-2 border border-white/10">
                <span className="font-bold text-zinc-200">{s.match_title}</span>
                <span className="text-zinc-400">{s.kickoff_time}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manage Custom Channels */}
      <div className="vip-glass rounded-2xl p-6">
        <h2 className="text-xl font-bold text-zinc-100 mb-4">Manage Custom Channels</h2>

        {channels.length === 0 ? (
          <p className="text-zinc-400 text-sm">No channels yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 text-xs font-bold uppercase text-left">
                  <th className="p-2">Channel</th>
                  <th className="p-2">M3U URL</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id} className="hover:bg-white/5">
                    <td className="p-2 font-medium text-zinc-200">
                      <span className="flex items-center gap-2">
                        {channel.logo ? (
                          <img src={channel.logo} alt={channel.name} className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-eviv-lime/15 text-[10px] font-black text-eviv-lime">
                            {String(channel.name || '?').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        {channel.name}
                      </span>
                    </td>
                    <td className="p-2 max-w-[220px] truncate overflow-hidden whitespace-nowrap text-[11px] text-zinc-400">
                      {channel.m3u_url}
                    </td>
                    <td className="p-2">
                      <span
                        className={`rounded text-xs font-bold px-2 py-1 border ${
                          channel.is_active
                            ? 'bg-eviv-lime/15 text-eviv-lime border-eviv-lime/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 italic'
                        }`}
                      >
                        {channel.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => toggleChannel(channel)}
                        className="tactile mr-2 rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-zinc-200 hover:border-eviv-lime/50"
                        title={channel.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {channel.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChannel(channel.id)}
                        className="tactile rounded-md border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/10"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
