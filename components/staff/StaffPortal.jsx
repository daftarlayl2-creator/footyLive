'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Coins,
  Crown,
  Landmark,
  Loader2,
  Lock,
  Mail,
  Megaphone,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import UsersTab from '@/components/admin/UsersTab';
import { capabilityList, findStaffRole } from '@/lib/admin/rbac';
import { formatMad } from '@/lib/ads/enquiries';
import { playSound } from '@/lib/sound/uiSound';

const STATUS_STYLE = {
  new: 'border-eviv-lime/45 bg-eviv-lime/10 text-eviv-lime',
  contacted: 'border-sky-400/45 bg-sky-400/10 text-sky-200',
  won: 'border-amber-300/45 bg-amber-300/10 text-amber-200',
  lost: 'border-white/15 bg-white/5 text-zinc-400',
};

const STATUS_AR = { new: 'جديد', contacted: 'تم التواصل', won: 'متعاقد', lost: 'مغلق' };

/**
 * Advertiser desk — the queue every lead from "Advertise With Us" lands in.
 * Only rendered for a desk that owns `ads.manage` (owner + league moderator).
 */
function AdvertiserQueue() {
  const [state, setState] = useState({ loading: true, error: '', leads: [], counts: null });
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/ads/enquiries', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Ad desk failed (${response.status})`);
      setState({ loading: false, error: '', leads: Array.isArray(data.leads) ? data.leads : [], counts: data.counts ?? null });
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err instanceof Error ? err.message : 'Ad desk unavailable' }));
    }
  };

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 45_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const move = async (id, status) => {
    setBusyId(id);
    try {
      const response = await fetch('/api/ads/enquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not update the lead.');
      playSound('tap');
      await load();
    } catch (err) {
      setState((current) => ({ ...current, error: err instanceof Error ? err.message : 'Update failed.' }));
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="vip-glass rounded-2xl border border-white/10 p-4" data-advertiser-desk="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-zinc-200">
          <Megaphone className="h-4 w-4 text-eviv-lime" aria-hidden="true" /> Advertiser desk
        </h3>
        <div className="flex items-center gap-2">
          {state.counts ? (
            <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400" data-advertise-counts="">
              {state.counts.new} new · {state.counts.contacted} contacted · {state.counts.won} won
            </span>
          ) : null}
          <button
            type="button"
            onClick={load}
            className="tactile inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-eviv-lime/40 hover:text-eviv-lime"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">
          {state.error}
        </p>
      ) : null}

      {state.loading ? (
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-white/5" aria-busy="true" />
      ) : state.leads.length === 0 ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-center text-xs font-semibold text-zinc-400">
          No advertiser enquiries yet. Leads from the banner and /advertise land here instantly.
        </p>
      ) : (
        <ul role="list" className="mt-3 space-y-2.5">
          {state.leads.slice(0, 25).map((lead) => (
            <li key={lead.id} data-ad-lead={lead.reference} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-black text-white">
                    <Building2 className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
                    {lead.brand}
                    <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">{lead.reference}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${STATUS_STYLE[lead.status] ?? STATUS_STYLE.new}`}>
                      {lead.status} · {STATUS_AR[lead.status] ?? ''}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-zinc-300">{lead.message}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-zinc-400">
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" aria-hidden="true" /> {lead.email}</span>
                    {lead.phone ? <span>{lead.phone}</span> : null}
                    <span>{lead.packageId}</span>
                    {lead.budget ? <span className="text-eviv-lime">{lead.budget}</span> : null}
                    {lead.partner && lead.partner !== 'direct' ? <span>via {lead.partner}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {busyId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-eviv-lime" aria-hidden="true" /> : null}
                  {['contacted', 'won', 'lost'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busyId === lead.id || lead.status === status}
                      onClick={() => move(lead.id, status)}
                      data-ad-lead-action={`${lead.reference}:${status}`}
                      className="tactile rounded-lg border border-white/12 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-300 hover:border-eviv-lime/45 hover:text-eviv-lime disabled:opacity-40"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Unified staff portal (`/staff`, hosted on `staff.eviv.si`).
 *
 * One sign-in for the whole team: each username resolves to a desk, the desk
 * decides the tabs and the buttons, and the API enforces the same matrix. The
 * portal deliberately never shows a control the session cannot use — locked
 * cards name the capability instead, so a moderator knows exactly what to ask
 * the owner for.
 */
export default function StaffPortal({ hostRole = 'owner', staffHost = false, host = '' }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('fans');

  const load = async () => {
    try {
      const response = await fetch('/api/admin/auth', { cache: 'no-store' });
      const data = await response.json();
      setSession(data);
    } catch {
      setSession({ authenticated: false });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, []);

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(form.get('username') || '').trim(), password: String(form.get('password') || '') }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.authenticated) {
        setError(data?.error || 'Invalid username or password');
        playSound('error');
        return;
      }
      playSound('success');
      await load();
    } catch {
      setError('Unable to reach the authentication server.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' }).catch(() => undefined);
    setSession({ authenticated: false });
  };

  const role = session?.role ?? hostRole;
  const desk = findStaffRole(role);
  const capabilities = capabilityList(role);
  const permissions = capabilities.map((capability) => capability.id);
  const can = (permission) => permissions.includes(permission);

  const desks = session?.desks ?? [];
  const provisioned = session?.provisioned ?? [];

  const tabs = [
    { id: 'fans', label: 'Fans & moderation', icon: UsersRound, required: 'users.view' },
    { id: 'ads', label: 'Advertisers', icon: Megaphone, required: 'ads.manage' },
  ].filter((entry) => can(entry.required));

  // Derived, not synced: a desk without a tab simply shows the first one it owns.
  const activeTab = tabs.some((entry) => entry.id === tab) ? tab : (tabs[0]?.id ?? '');

  if (checking) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-eviv-lime" aria-hidden="true" />
      </div>
    );
  }

  if (!session?.authenticated) {
    return (
      <div className="staff-portal mx-auto w-full max-w-3xl px-4 py-10" data-staff-portal="">
        <header className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-eviv-lime/35 bg-eviv-lime/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-eviv-lime">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Limon Live staff
          </p>
          <h1 className="staff-title mt-3 text-2xl font-black tracking-tight sm:text-3xl">Unified team portal</h1>
          <p dir="rtl" className="staff-copy mt-2 text-xs font-semibold">
            بوابة موحدة لفريق ليمون لايف: مشرفو الدوريات ومديرو الدعم يدخلون من هنا بصلاحيات محددة بدقة.
          </p>
          {staffHost ? (
            <p className="staff-note mt-2 text-[11px] font-bold" data-staff-host>
              Signed in on the staff host{host ? ` (${host})` : ''}.
            </p>
          ) : null}
        </header>

        <form onSubmit={login} className="vip-glass mx-auto mt-6 max-w-sm rounded-3xl border border-white/12 p-5">
          <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
            Staff username
            <input
              name="username"
              required
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-eviv-lime/60"
            />
          </label>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-eviv-lime/60"
            />
          </label>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className="lime-cta tactile mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Signing in…' : 'Sign in to the desk'}
          </button>
          <p className="mt-3 text-[10px] font-semibold text-zinc-500">
            Team credentials are provisioned by the platform owner (env: MODERATOR_* / SUPPORT_*). Sessions last 12 hours.
          </p>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {deskCards(desks, provisioned)}
        </div>
      </div>
    );
  }

  return (
    <div className="staff-portal mx-auto w-full max-w-6xl px-4 py-6" data-staff-portal="">
      <header className="vip-glass flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/12 p-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> Signed in as
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-lg font-black text-white" data-staff-role={role}>
            {desk?.label ?? role}
            <span dir="rtl" className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${desk?.chipClass ?? ''}`}>
              {desk?.labelAr ?? ''}
            </span>
          </h1>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">{desk?.duty}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capabilities.slice(0, 6).map((capability) => (
            <span key={capability.id} data-staff-capability={capability.id} className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
              {capability.en}
            </span>
          ))}
          {can('finance.view') ? (
            <a href="/mounadel" className="tactile inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-black text-zinc-200 hover:border-eviv-lime/45 hover:text-eviv-lime">
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" /> Command centre
            </a>
          ) : null}
          <button type="button" onClick={logout} className="tactile rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-black text-zinc-200 hover:border-red-400/45 hover:text-red-300">
            Sign out
          </button>
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Staff tools">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={activeTab === entry.id}
            className={`staff-tab tactile inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wide ${
              activeTab === entry.id ? 'staff-tab--active bg-eviv-lime text-[#18030A]' : 'border'
            }`}
          >
            <entry.icon className="h-3.5 w-3.5" aria-hidden="true" /> {entry.label}
          </button>
        ))}
        {!can('users.coins') ? (
          <span className="staff-locked inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" /> Coin tools: owner only
          </span>
        ) : null}
        {!can('users.vip') ? (
          <span className="staff-locked inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" /> VIP grants: owner only
          </span>
        ) : null}
      </nav>

      <div className="mt-4 space-y-5">
        {activeTab === 'fans' && can('users.view') ? <UsersTab permissions={permissions} role={role} /> : null}
        {activeTab === 'ads' && can('ads.manage') ? <AdvertiserQueue /> : null}
        {!tabs.length ? (
          <p className="vip-glass rounded-2xl border border-white/10 p-6 text-center text-sm font-semibold text-zinc-300">
            <Lock className="mx-auto mb-2 h-5 w-5 text-zinc-400" aria-hidden="true" />
            This desk has no tools provisioned yet — ask the platform owner to widen your role.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Role cards on the signed-out screen: who can do what, and who is live. */
function deskCards(desks, provisioned) {
  const list = Array.isArray(desks) && desks.length ? desks : [];
  const rows = list.length
    ? list
    : [
        { id: 'owner', label: 'Platform Owner', labelAr: 'مالك المنصة', duty: 'Full command centre.', accent: '#F5C544' },
        { id: 'moderator', label: 'League Moderator', labelAr: 'مشرف الدوري', duty: 'Matchday moderation desk.', accent: '#CCFF00' },
        { id: 'support', label: 'Support Manager', labelAr: 'مدير الدعم الفني', duty: 'Fan support and notices.', accent: '#38BDF8' },
      ];
  return rows.map((desk) => {
    const live = !Array.isArray(provisioned) || provisioned.includes(desk.id);
    return (
      <article key={desk.id} data-staff-desk={desk.id} className="vip-glass rounded-2xl border border-white/12 p-4">
        <p className="flex items-center gap-2 text-xs font-black text-white">
          <BadgeCheck className="h-4 w-4" style={{ color: desk.accent }} aria-hidden="true" />
          {desk.label}
          <span className="rounded-full border border-white/12 bg-white/5 px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-300">
            {live ? 'Active' : 'Not provisioned'}
          </span>
        </p>
        <p dir="rtl" className="mt-1 text-[11px] font-bold text-zinc-300">{desk.labelAr}</p>
        <p className="mt-1 text-[11px] font-semibold text-zinc-400">{desk.duty}</p>
      </article>
    );
  });
}
