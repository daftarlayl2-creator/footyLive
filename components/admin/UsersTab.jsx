'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  CircleCheck,
  Coins,
  Crown,
  Eye,
  Filter,
  Flame,
  Loader2,
  Mail,
  RefreshCcw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import EvivCoin from '@/components/coins/EvivCoin';
import VipBadge from '@/components/auth/VipBadge';
import { SENDER_THEMES } from '@/lib/inbox';

const fmt = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '—');
const short = (id) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const VIP_TIER_OPTIONS = [
  { id: 'free', label: 'Free (No tier)', badgeColor: 'text-zinc-400 bg-white/5 border-white/10' },
  { id: 'bronze', label: 'Bronze Pass', badgeColor: 'text-[#E0A068] bg-[#E0A068]/15 border-[#E0A068]/40' },
  { id: 'silver', label: 'Silver Pass', badgeColor: 'text-[#E8EDF4] bg-white/15 border-white/40' },
  { id: 'gold', label: 'Gold VIP (Trophy)', badgeColor: 'text-[#FFE27A] bg-[#FFE27A]/15 border-[#FFE27A]/40' },
  { id: 'diamond', label: 'Diamond VIP (Gem)', badgeColor: 'text-[#B8FBFF] bg-[#3BA7C9]/20 border-[#B8FBFF]/40' },
];

/**
 * /mounadel → Users Tab: Fully Interactive Command Center
 *
 * Direct coin adjustments, one-click Ban/Unban, manual VIP tier assignment,
 * and direct sender messaging (إدارة الموقع / الأدمين / الدعم الفني).
 */
export default function UsersTab() {
  const [users, setUsers] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [coinDrafts, setCoinDrafts] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, active, banned, vip, elite
  const [messageModal, setMessageModal] = useState(null); // { userId, handle }
  const [msgDraft, setMsgDraft] = useState({ from: 'admin', subject: '', body: '', subjectAr: '', bodyAr: '' });
  const [sendingMsg, setSendingMsg] = useState(false);

  const load = async () => {
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Users table failed (${response.status})`);
      const data = await response.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
      if (Array.isArray(data.tiers)) setTiers(data.tiers);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Users table unavailable');
    }
  };

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const act = async (payload, userId) => {
    setBusyId(userId);
    setNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Action failed (${response.status})`);
      if (payload.action === 'coins') {
        const delta = payload.delta;
        const sign = delta > 0 ? `+${fmt(delta)}` : fmt(delta);
        setNotice(`Coins updated (${sign}) — new balance: ${fmt(data.balance)}`);
      } else if (payload.action === 'set-balance') {
        setNotice(`Balance explicitly set to ${fmt(data.balance)} coins`);
      } else if (payload.action === 'vip') {
        setNotice(`VIP tier changed to ${payload.tier.toUpperCase()} for ${short(userId)}`);
      } else {
        setNotice(payload.action === 'ban' ? 'Viewer banned.' : 'Viewer unbanned.');
      }
      setCoinDrafts((drafts) => ({ ...drafts, [userId]: '' }));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId('');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageModal?.userId) return;
    setSendingMsg(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: messageModal.userId,
          action: 'message',
          from: msgDraft.from,
          subject: msgDraft.subject,
          body: msgDraft.body,
          subjectAr: msgDraft.subjectAr,
          bodyAr: msgDraft.bodyAr,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Message delivery failed');
      setNotice(`Official notice sent to ${messageModal.handle || short(messageModal.userId)}`);
      setMessageModal(null);
      setMsgDraft({ from: 'admin', subject: '', body: '', subjectAr: '', bodyAr: '' });
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Message failed.');
    } finally {
      setSendingMsg(false);
    }
  };

  // Stats summary
  const stats = useMemo(() => {
    if (!users) return null;
    let total = users.length;
    let active = 0;
    let banned = 0;
    let vipCount = 0;
    let totalCoins = 0;
    for (const u of users) {
      if (u.banned) banned += 1;
      else active += 1;
      if (u.vipTier && u.vipTier !== 'free') vipCount += 1;
      if (typeof u.balance === 'number') totalCoins += u.balance;
    }
    return { total, active, banned, vipCount, totalCoins };
  }, [users]);

  // Filtered rows
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      // Filter logic
      if (filter === 'active' && u.banned) return false;
      if (filter === 'banned' && !u.banned) return false;
      if (filter === 'vip' && (!u.vipTier || u.vipTier === 'free')) return false;
      if (filter === 'elite' && !u.id.includes('limonelite') && u.handle !== 'LimonElite') return false;

      // Search logic
      if (search) {
        const query = search.toLowerCase();
        const matchesId = u.id.toLowerCase().includes(query);
        const matchesHandle = (u.handle || '').toLowerCase().includes(query);
        const matchesPath = (u.lastPath || '').toLowerCase().includes(query);
        const matchesTier = (u.vipTier || '').toLowerCase().includes(query);
        if (!matchesId && !matchesHandle && !matchesPath && !matchesTier) return false;
      }
      return true;
    });
  }, [users, filter, search]);

  return (
    <div className="space-y-5" data-admin-users="">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-200 flex items-center gap-2">
            <Shield className="h-4 w-4 text-eviv-lime" aria-hidden="true" />
            Interactive User Command Center
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">
            Real-time viewer mutations: instant coin adjustments, one-click moderation, VIP tier grants, and direct dispatches.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="tactile inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-eviv-lime/40 hover:text-eviv-lime"
        >
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Metrics Stat Strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="vip-glass rounded-xl p-3 border border-white/10">
            <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
              <Users className="h-3 w-3 text-zinc-400" aria-hidden="true" /> Total Fans
            </span>
            <p className="mt-1 text-lg font-black text-white tabular-nums">{fmt(stats.total)}</p>
          </div>
          <div className="vip-glass rounded-xl p-3 border border-white/10">
            <span className="text-[10px] uppercase font-bold text-eviv-lime flex items-center gap-1">
              <UserCheck className="h-3 w-3 text-eviv-lime" aria-hidden="true" /> Active
            </span>
            <p className="mt-1 text-lg font-black text-eviv-lime tabular-nums">{fmt(stats.active)}</p>
          </div>
          <div className="vip-glass rounded-xl p-3 border border-white/10">
            <span className="text-[10px] uppercase font-bold text-red-400 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-red-400" aria-hidden="true" /> Suspended
            </span>
            <p className="mt-1 text-lg font-black text-red-400 tabular-nums">{fmt(stats.banned)}</p>
          </div>
          <div className="vip-glass rounded-xl p-3 border border-white/10">
            <span className="text-[10px] uppercase font-bold text-amber-300 flex items-center gap-1">
              <Crown className="h-3 w-3 text-amber-300" aria-hidden="true" /> VIP Members
            </span>
            <p className="mt-1 text-lg font-black text-amber-300 tabular-nums">{fmt(stats.vipCount)}</p>
          </div>
          <div className="vip-glass rounded-xl p-3 border border-white/10 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-eviv-lime flex items-center gap-1">
              <Coins className="h-3 w-3 text-eviv-lime" aria-hidden="true" /> Circulating Coins
            </span>
            <p className="mt-1 text-lg font-black text-white tabular-nums truncate" title={fmt(stats.totalCoins)}>
              {fmt(stats.totalCoins)}
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="vip-glass rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 border border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-zinc-400 mr-1" aria-hidden="true" />
          {[
            { id: 'all', label: 'All Viewers' },
            { id: 'active', label: 'Active' },
            { id: 'banned', label: 'Suspended' },
            { id: 'vip', label: 'VIP Passes' },
            { id: 'elite', label: 'LimonElite Spy' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`tactile px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition ${
                filter === tab.id
                  ? 'bg-eviv-lime text-[#18030A]'
                  : 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, handle, path, tier…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-eviv-lime/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-eviv-lime/30 bg-eviv-lime/10 px-3 py-2 text-xs font-bold text-eviv-lime">{notice}</p>}

      {users === null ? (
        <div className="vip-glass h-48 animate-pulse rounded-2xl" aria-busy="true" />
      ) : filteredUsers.length === 0 ? (
        <p className="vip-glass rounded-2xl p-6 text-sm text-zinc-300 text-center">
          {search || filter !== 'all' ? 'No matching viewer records for this filter.' : 'No viewers registered yet. Rows appear automatically as fans interact.'}
        </p>
      ) : (
        <div className="vip-glass overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-black/20">
                  <th className="px-4 py-3">Viewer & Identity</th>
                  <th className="px-3 py-3">Last Seen</th>
                  <th className="px-3 py-3 text-right">Pageviews</th>
                  <th className="px-3 py-3 text-right">Limon Coins</th>
                  <th className="px-3 py-3">VIP Tier</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Moderation</th>
                  <th className="px-3 py-3">Quick Coins</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((row) => {
                  const draft = coinDrafts[row.id] ?? '';
                  const busy = busyId === row.id;
                  const isElite = row.id.includes('limonelite') || row.handle === 'LimonElite';
                  const currentTier = row.vipTier || 'free';

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-white/5 transition ${
                        isElite
                          ? 'bg-amber-400/[0.08] hover:bg-amber-400/[0.12] border-amber-400/20'
                          : row.banned
                            ? 'bg-red-500/[0.06] hover:bg-red-500/[0.1]'
                            : 'hover:bg-white/[0.04]'
                      }`}
                      data-user-row={row.id}
                      data-banned={String(row.banned)}
                    >
                      {/* Identity */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-mono font-bold text-zinc-100" title={row.id}>
                                {short(row.id)}
                              </p>
                              {isElite && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/20 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-amber-200">
                                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" /> SPY / ELITE
                                </span>
                              )}
                              {row.unread > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-eviv-lime/20 text-eviv-lime px-1 text-[9px] font-black" title="Unread inbox messages">
                                  <Mail className="h-2.5 w-2.5" aria-hidden="true" /> {row.unread}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 max-w-[200px] truncate">
                              {row.handle ? <span className="font-bold text-zinc-300 mr-1">@{row.handle}</span> : null}
                              <span className="text-zinc-500">{row.lastPath || '—'}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Last Seen */}
                      <td className="px-3 py-3 text-zinc-300 text-[11px] whitespace-nowrap">
                        {fmtTime(row.lastSeen)}
                      </td>

                      {/* Pageviews */}
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                        {fmt(row.pageviews)}
                      </td>

                      {/* Limon Balance */}
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-100 whitespace-nowrap">
                        {row.balance === null ? (
                          '—'
                        ) : (
                          <span className="inline-flex items-center gap-1 font-black text-white" title={`${fmt(row.balance)} Limon Coins`}>
                            <EvivCoin size={14} spin={false} sparkle={false} />
                            {fmt(row.balance)}
                          </span>
                        )}
                      </td>

                      {/* VIP Tier Selector */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {currentTier !== 'free' && (
                            <VipBadge tier={currentTier} size={16} title={currentTier.toUpperCase()} />
                          )}
                          <select
                            disabled={busy}
                            value={currentTier}
                            onChange={(e) => act({ id: row.id, action: 'vip', tier: e.target.value }, row.id)}
                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[10.5px] font-bold text-zinc-200 focus:outline-none focus:border-eviv-lime/50 cursor-pointer disabled:opacity-50"
                            aria-label={`VIP tier for ${short(row.id)}`}
                          >
                            {VIP_TIER_OPTIONS.map((t) => (
                              <option key={t.id} value={t.id} className="bg-[#18030A] text-white">
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
                            row.banned
                              ? 'border-red-500/40 bg-red-500/10 text-red-300'
                              : 'border-eviv-lime/35 bg-eviv-lime/10 text-eviv-lime'
                          }`}
                        >
                          {row.banned ? 'BANNED' : 'ACTIVE'}
                        </span>
                      </td>

                      {/* Moderation Button */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act({ id: row.id, action: row.banned ? 'unban' : 'ban' }, row.id)}
                          className={`tactile inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide disabled:opacity-50 ${
                            row.banned
                              ? 'border-eviv-lime/40 text-eviv-lime hover:bg-eviv-lime/10'
                              : 'border-red-500/40 text-red-300 hover:bg-red-500/10'
                          }`}
                          data-action={row.banned ? 'unban' : 'ban'}
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : row.banned ? (
                            <CircleCheck className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Ban className="h-3 w-3" aria-hidden="true" />
                          )}
                          {row.banned ? 'Unban' : 'Ban'}
                        </button>
                      </td>

                      {/* Direct Coin Adjustments: Quick buttons + input */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ id: row.id, action: 'coins', delta: 500, note: '+500 quick reward' }, row.id)}
                            className="tactile px-1.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-black text-eviv-lime border border-white/10"
                            title="Add 500 coins"
                          >
                            +500
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ id: row.id, action: 'coins', delta: 5000, note: '+5,000 VIP boost' }, row.id)}
                            className="tactile px-1.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-black text-amber-300 border border-white/10"
                            title="Add 5,000 coins"
                          >
                            +5k
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ id: row.id, action: 'coins', delta: -1000, note: '-1,000 adjustment' }, row.id)}
                            className="tactile px-1.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-black text-red-300 border border-white/10"
                            title="Deduct 1,000 coins"
                          >
                            -1k
                          </button>
                        </div>
                      </td>

                      {/* Custom Input & Dispatch */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const delta = Number(draft);
                              if (Number.isFinite(delta) && delta !== 0) act({ id: row.id, action: 'coins', delta }, row.id);
                            }}
                          >
                            <input
                              type="number"
                              step="1"
                              min="-1000000"
                              max="1000000"
                              value={draft}
                              onChange={(event) => setCoinDrafts((drafts) => ({ ...drafts, [row.id]: event.target.value }))}
                              placeholder="± coins"
                              aria-label={`Coin adjustment for ${short(row.id)}`}
                              className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-bold text-white placeholder-zinc-500 focus:border-eviv-lime/50 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={busy || !draft || Number(draft) === 0}
                              className="tactile inline-flex items-center gap-1 rounded-lg bg-eviv-lime px-2 py-1 text-[10px] font-black text-[#18030A] disabled:opacity-40 cursor-pointer"
                            >
                              <Coins className="h-3 w-3" aria-hidden="true" />
                              Apply
                            </button>
                          </form>

                          {/* Message Button */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setMessageModal({ userId: row.id, handle: row.handle || short(row.id) })}
                            className="tactile p-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-eviv-lime/40"
                            title="Send styled inbox message"
                          >
                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Styled Direct Message Modal */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="vip-glass w-full max-w-lg rounded-2xl border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Send className="h-4 w-4 text-eviv-lime" aria-hidden="true" />
                  Dispatch Direct Message
                </h3>
                <p className="text-[11px] text-zinc-400">Recipient: <span className="font-mono text-zinc-200">{messageModal.handle}</span></p>
              </div>
              <button
                type="button"
                onClick={() => setMessageModal(null)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="mt-4 space-y-3">
              {/* Sender Selector */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1.5">
                  Sender Identity & Styling Hierarchy
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(SENDER_THEMES).map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setMsgDraft((d) => ({ ...d, from: theme.id }))}
                      className={`tactile p-2 rounded-xl border text-left flex flex-col gap-0.5 ${
                        msgDraft.from === theme.id
                          ? 'border-eviv-lime bg-white/10 shadow-sm'
                          : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      <span className="text-[11px] font-black" style={{ color: theme.accent }} dir="rtl">
                        {theme.nameAr}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                        {theme.nameEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                  Subject (English)
                </label>
                <input
                  required
                  value={msgDraft.subject}
                  onChange={(e) => setMsgDraft((d) => ({ ...d, subject: e.target.value }))}
                  placeholder="e.g. VIP entitlement verified or Reward bonus"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-eviv-lime/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                  Subject (Arabic - Optional)
                </label>
                <input
                  value={msgDraft.subjectAr}
                  dir="rtl"
                  onChange={(e) => setMsgDraft((d) => ({ ...d, subjectAr: e.target.value }))}
                  placeholder="عنوان الرسالة بالعربية…"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-eviv-lime/50 text-right"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                  Message Content
                </label>
                <textarea
                  required
                  rows={3}
                  value={msgDraft.body}
                  onChange={(e) => setMsgDraft((d) => ({ ...d, body: e.target.value }))}
                  placeholder="Write the message text. It will render in the recipient's inbox with official sender seals and styling."
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-eviv-lime/50 resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setMessageModal(null)}
                  className="tactile px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingMsg || !msgDraft.subject || !msgDraft.body}
                  className="lime-cta tactile inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black disabled:opacity-50 cursor-pointer"
                >
                  {sendingMsg ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                  Dispatch to Inbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
