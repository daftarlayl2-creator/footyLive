'use client';

import { useState } from 'react';
import { BarChart3, Check, Globe2, Handshake, Radar, ShieldCheck, Sparkles, TrendingUp, Users } from 'lucide-react';
import AdvertiseWithUsModal from '@/components/ads/AdvertiseWithUsModal';
import { AD_PACKAGES, formatMad } from '@/lib/ads/enquiries';
import { playSound } from '@/lib/sound/uiSound';

/** Headline numbers shown above the rate card. */
const REACH_STATS = [
  { icon: Users, label: 'Monthly fans', value: '410k', detail: 'Morocco, MENA and the diaspora' },
  { icon: BarChart3, label: 'Impressions', value: '1.9M', detail: 'Banner, match centre, Multi-View' },
  { icon: Globe2, label: 'Languages', value: 'AR / FR / EN', detail: 'Bilingual creatives supported' },
  { icon: TrendingUp, label: 'Matchday lift', value: '3.2×', detail: 'Traffic on derby kick-offs' },
];

const GUARANTEES = [
  { icon: ShieldCheck, title: 'Brand-safe by construction', body: 'House creatives are first-party CSS/SVG. No pop-unders, no malware frames, no autoplay audio.' },
  { icon: Radar, title: 'Honest reporting', body: 'Every slide reports impressions and clicks through our own beacon — you see the same numbers our dashboard shows.' },
  { icon: Sparkles, title: 'Creative included', body: 'Send a logo and one line; our design desk returns Arabic + French banner art for approval within 48 hours.' },
  { icon: Handshake, title: 'No lock-in', body: 'Monthly placements, cancel anytime before the next cycle. Sponsorships are per-fixture.' },
];

/**
 * /advertise — the public advertiser desk.
 *
 * Reached from every house slide of the top rotating banner
 * (`/advertise?partner=atlas-boots`), the "Advertise With Us" button in the
 * banner chrome and the footer. It shows the rate card, the reach and the
 * guarantees, then hands off to `AdvertiseWithUsModal` for the enquiry itself.
 */
export default function AdvertiseLanding({ partner = '', initialPackage = '' }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(initialPackage);

  const openWith = (packageId) => {
    setPicked(packageId || '');
    setOpen(true);
    playSound('tap');
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <section className="advertise-hero relative overflow-hidden rounded-3xl border border-eviv-lime/25 p-6 sm:p-9">
        <span className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-eviv-lime/15 blur-3xl" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eviv-lime/60 to-transparent" aria-hidden="true" />

        <p className="advertise-badge relative inline-flex items-center gap-2 rounded-full border border-eviv-lime/35 bg-eviv-lime/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-eviv-lime">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Limon Live ad desk
        </p>
        <h1 className="advertise-hero__title relative mt-3 text-2xl font-black leading-tight tracking-tight sm:text-4xl">
          Put your brand in front of every fan on matchday.
        </h1>
        <p dir="rtl" className="advertise-hero__copy relative mt-2 max-w-2xl text-sm font-semibold">
          جمهور كروي حقيقي، شاشات عالية التفاعل، وتصاميم مجانية بعلامتك. احجز مكانك في البانر الدوار أو في مركز المباراة.
        </p>

        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openWith(picked)}
            data-advertise-cta=""
            className="lime-cta tactile inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"
          >
            <Handshake className="h-4 w-4" aria-hidden="true" /> Advertise With Us
          </button>
          <a
            href="mailto:ads@limon.live?subject=Limon%20Live%20media%20kit"
            className="tactile inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-zinc-100 hover:border-eviv-lime/45 hover:text-eviv-lime"
          >
            Request the media kit
          </a>
          {partner ? (
            <span className="advertise-partner-note rounded-xl border px-3 py-2 text-[11px] font-bold" data-advertise-partner>
              Arrived from <span className="font-black text-eviv-lime">{partner}</span> — we pre-filled your brand.
            </span>
          ) : null}
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REACH_STATS.map((stat) => (
            <div key={stat.label} className="advertise-stat rounded-2xl border p-3">
              <dt className="advertise-stat__label flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em]">
                <stat.icon className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" /> {stat.label}
              </dt>
              <dd className="advertise-stat__value mt-1 text-lg font-black">{stat.value}</dd>
              <dd className="advertise-stat__detail text-[10px] font-semibold">{stat.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="rate-card-heading">
        <h2 id="rate-card-heading" className="advertise-section-title text-sm font-black uppercase tracking-[0.18em]">
          Rate card
        </h2>
        <ul role="list" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AD_PACKAGES.map((row) => (
            <li
              key={row.id}
              data-ad-package-card={row.id}
              className={`advertise-package glass-dark relative flex flex-col overflow-hidden rounded-3xl border p-4 ${
                row.featured ? 'border-eviv-lime/45' : 'border-white/10'
              }`}
            >
              {row.featured ? (
                <span className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full bg-eviv-lime/15 blur-3xl" aria-hidden="true" />
              ) : null}
              <div className="relative flex items-start justify-between gap-2">
                <h3 className="text-sm font-black text-white">{row.name}</h3>
                {row.featured ? (
                  <span className="shrink-0 rounded-full border border-eviv-lime/40 bg-eviv-lime/10 px-2 py-0.5 text-[9px] font-black uppercase text-eviv-lime">
                    Most booked
                  </span>
                ) : null}
              </div>
              <p className="relative mt-1 text-[11px] font-semibold text-zinc-300">{row.blurb}</p>
              <p dir="rtl" className="relative mt-1 text-[11px] font-semibold text-zinc-400">{row.blurbAr}</p>
              <p className="relative mt-2 text-[11px] font-bold text-zinc-400">{row.placement}</p>
              <p className="relative mt-3 text-xl font-black text-eviv-lime">{formatMad(row.priceMinor)}<span className="text-xs font-bold text-zinc-400">/mo</span></p>
              <p className="relative text-[10px] font-bold uppercase tracking-wide text-zinc-500">{row.reach}</p>
              <button
                type="button"
                onClick={() => openWith(row.id)}
                data-ad-package-cta={row.id}
                className={`tactile relative mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black ${
                  row.featured ? 'lime-cta' : 'border border-white/15 text-zinc-100 hover:border-eviv-lime/45 hover:text-eviv-lime'
                }`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Book this placement
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="guarantees-heading">
        <h2 id="guarantees-heading" className="advertise-section-title text-sm font-black uppercase tracking-[0.18em]">
          Why advertisers stay
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {GUARANTEES.map((item) => (
            <div key={item.title} className="advertise-guarantee glass-dark rounded-2xl border border-white/10 p-4">
              <p className="flex items-center gap-2 text-xs font-black text-white">
                <item.icon className="h-4 w-4 text-eviv-lime" aria-hidden="true" /> {item.title}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-zinc-300">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="advertise-hero mt-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-eviv-lime/25 p-5">
        <div>
          <p className="advertise-hero__title text-sm font-black">Ready when you are — the desk replies in 24 hours.</p>
          <p className="advertise-hero__copy mt-0.5 text-[11px] font-semibold">
            Or write straight to <a className="font-black text-eviv-lime underline decoration-eviv-lime/40 underline-offset-2" href="mailto:ads@limon.live">ads@limon.live</a>.
          </p>
        </div>
        <button type="button" onClick={() => openWith(picked)} className="lime-cta tactile rounded-2xl px-5 py-3 text-sm font-black">
          Start an enquiry
        </button>
      </section>

      <AdvertiseWithUsModal
        open={open}
        onClose={() => setOpen(false)}
        initialPartner={partner}
        initialPackage={picked}
      />
    </div>
  );
}
