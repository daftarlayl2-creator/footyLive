'use client';

import { useEffect, useState } from 'react';
import { Banknote, Coins, Crown, RefreshCcw } from 'lucide-react';

const fmt = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '0');
const fmtMad = (minor) => `${((minor || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} MAD`;
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const short = (id) => (id && id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id || '—');

const KIND_LABEL = {
  'coin-redeem': { label: 'VIP redemption', className: 'border-eviv-lime/35 bg-eviv-lime/10 text-eviv-lime' },
  'admin-adjustment': { label: 'Admin adjustment', className: 'border-sky-400/35 bg-sky-400/10 text-sky-200' },
  'billing-grant': { label: 'Pass purchase', className: 'border-amber-300/35 bg-amber-300/10 text-amber-200' },
};

/**
 * /mounadel → Finance tab: the subscription + EVIV Coin ledger with running
 * totals (append-only server records, latest first).
 */
export default function FinanceTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/admin/ledger', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Ledger failed (${response.status})`);
      setData(await response.json());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ledger unavailable');
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

  const totals = data?.totals;

  return (
    <div className="space-y-4" data-admin-finance="">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-200">Subscription & coin ledger</h2>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">Every server-side movement: pass purchases, coin redemptions and admin adjustments.</p>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="vip-glass admin-stat-pop rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400"><Banknote className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> Revenue (billing)</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-white">{fmtMad(totals?.revenueMinor ?? 0)}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-400">{fmt(totals?.billingGrants ?? 0)} pass grants</p>
        </div>
        <div className="vip-glass admin-stat-pop rounded-2xl p-4" style={{ animationDelay: '70ms' }}>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400"><Crown className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> VIP redemptions</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-white">{fmt(totals?.redemptions ?? 0)}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-400">{fmt(totals?.coinsSpent ?? 0)} coins spent</p>
        </div>
        <div className="vip-glass admin-stat-pop rounded-2xl p-4" style={{ animationDelay: '140ms' }}>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400"><Coins className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> Coins issued</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-white">{fmt(totals?.coinsIssued ?? 0)}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-400">rewards + admin grants</p>
        </div>
        <div className="vip-glass admin-stat-pop rounded-2xl p-4" style={{ animationDelay: '210ms' }}>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400"><Coins className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> Admin adjustments</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-white">{fmt(totals?.adminAdjustments ?? 0)}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-400">manual coin actions</p>
        </div>
      </div>

      {data === null ? (
        <div className="vip-glass h-40 animate-pulse rounded-2xl" aria-busy="true" />
      ) : data.entries.length === 0 ? (
        <p className="vip-glass rounded-2xl p-6 text-sm text-zinc-300">
          The ledger is empty. Redemptions, pass purchases and admin adjustments will appear here in real time.
        </p>
      ) : (
        <div className="vip-glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-3 py-2.5">Kind</th>
                  <th className="px-3 py-2.5">Viewer</th>
                  <th className="px-3 py-2.5 text-right">Coins</th>
                  <th className="px-3 py-2.5 text-right">Balance after</th>
                  <th className="px-3 py-2.5 text-right">MAD</th>
                  <th className="px-4 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const kind = KIND_LABEL[entry.kind] || KIND_LABEL['admin-adjustment'];
                  return (
                    <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-300">{fmtTime(entry.at)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black ${kind.className}`}>{kind.label}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-zinc-200" title={entry.userId}>{short(entry.userId)}</td>
                      <td className={`px-3 py-2.5 text-right font-black tabular-nums ${entry.coins < 0 ? 'text-red-300' : 'text-eviv-lime'}`}>
                        {entry.coins > 0 ? `+${fmt(entry.coins)}` : entry.coins < 0 ? fmt(entry.coins) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{Number.isFinite(entry.balanceAfter) ? fmt(entry.balanceAfter) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{entry.amountMinor ? fmtMad(entry.amountMinor) : '—'}</td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-400" title={entry.note}>{entry.note || '—'}</td>
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
