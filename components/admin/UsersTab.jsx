'use client';

import { useEffect, useState } from 'react';
import { Ban, CircleCheck, Coins, Loader2, RefreshCcw } from 'lucide-react';

const fmt = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '—');
const short = (id) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * /mounadel → Users tab: every verified viewer identity seen on site traffic,
 * with one-click Ban/Unban and instant EVIV Coin adjustments.
 */
export default function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [coinDrafts, setCoinDrafts] = useState({});

  const load = async () => {
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Users table failed (${response.status})`);
      const data = await response.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Users table unavailable');
    }
  };

  useEffect(() => {
    // Deferred first paint: keeps the effect body free of synchronous state
    // updates (the interval callback drives every refresh after that).
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
        setNotice(`Coins updated — new balance: ${fmt(data.balance)}`);
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

  return (
    <div className="space-y-4" data-admin-users="">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-200">User management</h2>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">
            Viewer identities from wallet/prediction traffic. Bans are enforced server-side on votes and coin actions.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="tactile inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-eviv-lime/40"
        >
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-eviv-lime/30 bg-eviv-lime/10 px-3 py-2 text-xs font-bold text-eviv-lime">{notice}</p>}

      {users === null ? (
        <div className="vip-glass h-40 animate-pulse rounded-2xl" aria-busy="true" />
      ) : users.length === 0 ? (
        <p className="vip-glass rounded-2xl p-6 text-sm text-zinc-300">
          No viewers registered yet. Rows appear automatically as fans vote, use their wallet or browse the site.
        </p>
      ) : (
        <div className="vip-glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5">Viewer</th>
                  <th className="px-3 py-2.5">Last seen</th>
                  <th className="px-3 py-2.5 text-right">Pageviews</th>
                  <th className="px-3 py-2.5 text-right">EVIV balance</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Moderation</th>
                  <th className="px-4 py-2.5">Coin adjustment</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const draft = coinDrafts[row.id] ?? '';
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id} className={`border-b border-white/5 ${row.banned ? 'bg-red-500/[0.06]' : 'hover:bg-white/5'}`} data-user-row={row.id} data-banned={String(row.banned)}>
                      <td className="px-4 py-2.5">
                        <p className="font-mono font-bold text-zinc-100" title={row.id}>{short(row.id)}</p>
                        <p className="max-w-[180px] truncate text-[10px] text-zinc-500">{row.lastPath || '—'}</p>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{fmtTime(row.lastSeen)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{fmt(row.pageviews)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-100">{row.balance === null ? '—' : fmt(row.balance)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${row.banned ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-eviv-lime/35 bg-eviv-lime/10 text-eviv-lime'}`}>
                          {row.banned ? 'BANNED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
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
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : row.banned ? <CircleCheck className="h-3 w-3" aria-hidden="true" /> : <Ban className="h-3 w-3" aria-hidden="true" />}
                          {row.banned ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <form
                          className="flex items-center gap-1.5"
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
                            className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-bold text-white placeholder-zinc-500 focus:border-eviv-lime/50 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={busy || !draft || Number(draft) === 0}
                            className="tactile inline-flex items-center gap-1 rounded-lg bg-eviv-lime px-2.5 py-1.5 text-[10px] font-black text-[#18030A] disabled:opacity-40"
                          >
                            <Coins className="h-3 w-3" aria-hidden="true" />
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
