'use client';

import { useEffect, useState } from 'react';
import { Activity, Coins, Eye, MousePointerClick, Radio, TrendingUp, UsersRound } from 'lucide-react';

const fmt = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '0');
const fmtMad = (minor) => `${((minor || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} MAD`;

function StatCard({ icon: Icon, label, value, detail, delay = 0, live = false }) {
  return (
    <div className="admin-stat-pop vip-glass relative overflow-hidden rounded-2xl p-4" style={{ animationDelay: `${delay}ms` }} data-admin-stat={label}>
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-eviv-lime/10 blur-2xl" aria-hidden="true" />
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
        {live ? <span className="admin-live-dot" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-2 text-3xl font-black tabular-nums text-white">{value}</p>
      {detail && <p className="mt-1 text-[11px] font-semibold text-zinc-400">{detail}</p>}
    </div>
  );
}

/** 14-day impressions sparkline (pure SVG). */
function Sparkline({ days }) {
  const width = 560;
  const height = 120;
  const values = (days || []).map((day) => day.impressions);
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(height - 12 - (value / max) * (height - 28)).toFixed(1)}`).join(' ');
  const area = values.length ? `0,${height} ${points} ${width},${height}` : '';
  return (
    <div className="vip-glass rounded-2xl p-4 sm:p-5" data-admin-sparkline="">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-300">Ad impressions — last 14 days</h3>
        <span className="text-[10px] font-bold text-zinc-500">{values.length} days tracked</span>
      </div>
      {values.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-28 w-full" role="img" aria-label="14-day impressions trend">
          <defs>
            <linearGradient id="admin-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CCFF00" stopOpacity="0.35" />
              <stop offset="1" stopColor="#CCFF00" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#admin-spark-fill)" />
          <polyline points={points} fill="none" stroke="#CCFF00" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {values.map((value, index) => (
            <circle key={index} cx={(index * step).toFixed(1)} cy={(height - 12 - (value / max) * (height - 28)).toFixed(1)} r="3" fill="#18030A" stroke="#CCFF00" strokeWidth="1.5" />
          ))}
        </svg>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-white/15 p-4 text-xs text-zinc-400">
          No impressions recorded yet — they appear as fans browse with ads enabled.
        </p>
      )}
      {values.length > 0 && (
        <div className="mt-1 flex justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          <span>{days[0].date.slice(5)}</span>
          <span>{days[days.length - 1].date.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * /mounadel → Command tab: live visitors, ad impressions/clicks with CTR and
 * the 14-day trend, refreshing every 15 seconds from /api/admin/overview.
 */
export default function CommandTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/admin/overview', { cache: 'no-store' });
        if (cancelled) return;
        if (response.status === 401) {
          setError('Session expired — sign in again.');
          return;
        }
        if (!response.ok) throw new Error(`Overview failed (${response.status})`);
        setData(await response.json());
        setError('');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Overview unavailable');
      }
    };
    // Deferred first paint: keeps the effect body free of synchronous state
    // updates (the interval callback drives every refresh after that).
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
     
  }, []);

  const metrics = data?.metrics;
  const finance = data?.finance;
  const users = data?.users;

  return (
    <div className="space-y-5" data-admin-command="">
      {error && <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Radio} label="Live now" value={fmt(metrics?.liveVisitors ?? 0)} detail="fans on site (90s window)" live delay={0} />
        <StatCard icon={Eye} label="Impressions today" value={fmt(metrics?.today.impressions ?? 0)} detail={`${fmt(metrics?.totals.impressions ?? 0)} all time`} delay={70} />
        <StatCard icon={MousePointerClick} label="CTR today" value={`${(metrics?.today.ctr ?? 0).toFixed(2)}%`} detail={`${fmt(metrics?.today.clicks ?? 0)} clicks today`} delay={140} />
        <StatCard icon={Activity} label="Pageviews today" value={fmt(metrics?.today.pageviews ?? 0)} detail={`${fmt(metrics?.today.visitors ?? 0)} unique visits`} delay={210} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={UsersRound} label="Registered viewers" value={fmt(users?.total ?? 0)} detail={`${fmt(users?.banned ?? 0)} banned`} delay={120} />
        <StatCard icon={TrendingUp} label="Passes sold (grants)" value={fmt(finance?.billingGrants ?? 0)} detail={fmtMad(finance?.revenueMinor ?? 0)} delay={190} />
        <StatCard icon={Coins} label="Coin redemptions" value={fmt(finance?.redemptions ?? 0)} detail={`${fmt(finance?.coinsSpent ?? 0)} coins spent`} delay={260} />
        <StatCard icon={Coins} label="Coins issued" value={fmt(finance?.coinsIssued ?? 0)} detail="rewards + admin grants" delay={330} />
      </div>

      <Sparkline days={metrics?.last14Days || []} />

      {/* Per-slot CTR table */}
      <div className="vip-glass overflow-hidden rounded-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-zinc-300">Ad slots — impressions & CTR</h3>
        </div>
        {metrics?.slots?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2">Slot</th>
                  <th className="px-4 py-2 text-right">Impressions</th>
                  <th className="px-4 py-2 text-right">Clicks</th>
                  <th className="px-4 py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {metrics.slots.map((slot) => (
                  <tr key={slot.slot} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 font-bold text-zinc-200">{slot.slot}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-300">{fmt(slot.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-300">{fmt(slot.clicks)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${slot.ctr >= 2 ? 'bg-eviv-lime/15 text-eviv-lime' : slot.ctr >= 0.75 ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-zinc-400'}`}>
                        {slot.ctr.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-5 text-xs text-zinc-400">No slot data yet. Impressions start flowing when the first ad renders.</p>
        )}
      </div>
    </div>
  );
}
