'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, Building2, Check, Loader2, Mail, Megaphone, Phone, Send, Sparkles, X } from 'lucide-react';
import { AD_PACKAGES, formatMad } from '@/lib/ads/enquiries';
import { playSound } from '@/lib/sound/uiSound';

/** Turns a banner deep-link id ("atlas-boots") into a display brand. */
function brandFromPartner(partner) {
  return typeof partner === 'string' && partner
    ? partner.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : '';
}

function createForm(initialPartner, initialPackage) {
  return {
    brand: brandFromPartner(initialPartner),
    contact: '',
    email: '',
    phone: '',
    packageId: AD_PACKAGES.find((row) => row.id === initialPackage)?.id ?? AD_PACKAGES[0].id,
    budget: '',
    window: '',
    message: '',
    website: '', // honeypot — never shown to a human
  };
}

/**
 * Advertiser onboarding modal — the "Advertise With Us" flow.
 *
 * Opened from the top rotating banner, the `/advertise` rate card and the footer
 * of the home feed. It posts to `/api/ads/enquiries`, which validates and files
 * the lead and returns a reference code the advertiser can quote. The success
 * state is deliberately explicit: package, price, reference and the 24-hour
 * reply promise, so the brand knows the enquiry landed somewhere real.
 *
 * Structure: the shell owns only the dialog chrome (Escape, scroll lock, focus
 * restore); the form is an inner component **keyed by the deep-link target**, so
 * reopening the modal starts from a clean state without any state-syncing
 * effect.
 *
 * Accessibility: `role="dialog"` + `aria-modal`, Escape to close, click-outside
 * to close, focus moved to the first field on open and restored on close, and
 * every field carries a real label. Motion is CSS-only and respects
 * `prefers-reduced-motion`.
 */
export default function AdvertiseWithUsModal({ open, onClose, initialPartner = '', initialPackage = '' }) {
  const titleId = useId();
  const descId = useId();
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = typeof document !== 'undefined' ? document.activeElement : null;
    const focusTimer = setTimeout(() => firstFieldRef.current?.focus?.(), 30);
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="advertise-modal fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <AdvertiseForm
        key={`${initialPartner}|${initialPackage}`}
        titleId={titleId}
        descId={descId}
        firstFieldRef={firstFieldRef}
        onClose={onClose}
        initialPartner={initialPartner}
        initialPackage={initialPackage}
      />
    </div>
  );
}

/** The dialog itself: header, rate card, form and the success state. */
function AdvertiseForm({ titleId, descId, firstFieldRef, onClose, initialPartner, initialPackage }) {
  const [form, setForm] = useState(() => createForm(initialPartner, initialPackage));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const selected = AD_PACKAGES.find((row) => row.id === form.packageId) ?? AD_PACKAGES[0];

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/ads/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: form.brand,
          contact: form.contact,
          email: form.email,
          phone: form.phone,
          packageId: form.packageId,
          // Budget + campaign window are folded into the notes the desk reads.
          budget: [form.budget, form.window].filter(Boolean).join(' · '),
          message: form.message,
          partner: initialPartner || 'direct',
          website: form.website,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(data?.error || 'We could not file that enquiry. Please try again.');
        playSound('error');
        return;
      }
      setResult({ ...data.enquiry, sla: data.sla });
      playSound('success');
    } catch {
      setError('Network hiccup — check your connection and try again.');
      playSound('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-advertise-modal=""
      className="advertise-modal__panel relative w-full max-w-2xl overflow-hidden rounded-3xl border border-eviv-lime/30 bg-[#18030A] text-zinc-100 shadow-[0_30px_90px_rgba(0,0,0,0.65)]"
    >
      <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-eviv-lime/15 blur-3xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eviv-lime/60 to-transparent" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="advertise-modal__seal mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-eviv-lime/15 text-eviv-lime">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId} className="text-base font-black tracking-tight text-white">
              Advertise With Us
            </h2>
            <p id={descId} dir="rtl" className="mt-0.5 text-[11px] font-semibold text-zinc-300">
              أعلن على ليمون لايف — الشاشة الأولى لمشجعي الكرة في المغرب والعالم العربي.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the advertiser form"
          className="tactile rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {result ? (
        <div className="relative px-5 py-6 text-center" data-advertise-success="">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-eviv-lime/45 bg-eviv-lime/12 text-eviv-lime">
            <Check className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="mt-3 text-sm font-black text-white">Enquiry filed — reference {result.reference}</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[11px] font-semibold text-zinc-300">
            {result.brand} · {selected.name} ({formatMad(selected.priceMinor)}/month). Our ad desk replies within{' '}
            {result.sla?.replyWithinHours ?? 24} hours from {result.sla?.contactEmail ?? 'ads@limon.live'}.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={onClose} className="lime-cta tactile rounded-xl px-4 py-2 text-xs font-black">
              Back to the football
            </button>
            <a
              href={`mailto:${result.sla?.contactEmail ?? 'ads@limon.live'}?subject=${encodeURIComponent(`Ad enquiry ${result.reference}`)}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-black text-zinc-100 hover:border-eviv-lime/45 hover:text-eviv-lime"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email the ad desk
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="relative space-y-3 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                <Building2 className="h-3 w-3 text-eviv-lime" aria-hidden="true" /> Brand / company
              </span>
              <input
                ref={firstFieldRef}
                name="brand"
                required
                minLength={2}
                maxLength={80}
                value={form.brand}
                onChange={update('brand')}
                placeholder="Atlas Boots"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Contact name</span>
              <input
                name="contact"
                required
                minLength={2}
                maxLength={80}
                value={form.contact}
                onChange={update('contact')}
                placeholder="Nadia Benali"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                <Mail className="h-3 w-3 text-eviv-lime" aria-hidden="true" /> Business email
              </span>
              <input
                name="email"
                required
                type="email"
                maxLength={120}
                value={form.email}
                onChange={update('email')}
                placeholder="nadia@atlasboots.ma"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                <Phone className="h-3 w-3 text-eviv-lime" aria-hidden="true" /> Phone (optional)
              </span>
              <input
                name="phone"
                maxLength={40}
                value={form.phone}
                onChange={update('phone')}
                placeholder="+212 6 12 34 56 78"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
          </div>

          <fieldset className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <legend className="px-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Pick a placement</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AD_PACKAGES.map((row) => {
                const active = row.id === form.packageId;
                return (
                  <label
                    key={row.id}
                    data-ad-package={row.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                      active ? 'border-eviv-lime/60 bg-eviv-lime/10' : 'border-white/10 hover:border-white/25'
                    }`}
                  >
                    <input
                      type="radio"
                      name="packageId"
                      value={row.id}
                      checked={active}
                      onChange={() => setForm((current) => ({ ...current, packageId: row.id }))}
                      className="mt-0.5 h-4 w-4 accent-[#CCFF00]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-black text-white">{row.name}</span>
                        {row.featured ? (
                          <span className="rounded-full border border-eviv-lime/40 bg-eviv-lime/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-eviv-lime">
                            Most booked
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-zinc-400">{row.placement}</span>
                      <span className="mt-1 block text-[11px] font-black text-eviv-lime">
                        {formatMad(row.priceMinor)}/mo · {row.reach}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Monthly budget (optional)</span>
              <input
                name="budget"
                maxLength={40}
                value={form.budget}
                onChange={update('budget')}
                placeholder="3,000 MAD"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Campaign window (optional)</span>
              <input
                name="window"
                maxLength={60}
                value={form.window}
                onChange={update('window')}
                placeholder="Botola derby week, 12–19 Nov"
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">What are you promoting?</span>
            <textarea
              name="message"
              required
              minLength={10}
              maxLength={900}
              rows={3}
              value={form.message}
              onChange={update('message')}
              placeholder="New boot drop for the derby — 15s banner, Arabic + French copy, landing on our store."
              className="w-full resize-y rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-zinc-500 focus:border-eviv-lime/60"
            />
          </label>

          {/* Honeypot: hidden from humans, irresistible to bots. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={form.website}
            onChange={update('website')}
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          {error ? (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
              No third-party scripts · first-party creatives · reply in 24h
            </p>
            <button
              type="submit"
              disabled={busy}
              className="lime-cta tactile inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {busy ? 'Filing enquiry…' : `Book ${selected.name}`}
            </button>
          </div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
            <BadgeCheck className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
            Your details are used only to answer this enquiry — no lists, no resale.
          </p>
        </form>
      )}
    </div>
  );
}
