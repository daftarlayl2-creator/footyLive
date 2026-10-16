import Link from 'next/link';
import { Crown, MonitorPlay, ShieldCheck, Zap } from 'lucide-react';
import PricingPlans from '@/components/subscription/PricingPlans';
import SubscriptionStatus from '@/components/subscription/SubscriptionStatus';

export const metadata = {
  title: 'VIP Passes — from 3 MAD | LIMON LIVE',
  description: 'Choose a 3 MAD match pass, 15 MAD weekly pass, 40 MAD monthly VIP or 150 MAD annual VIP. Ad-free football, FHD/4K where available and 4-screen Multi-View.',
  alternates: { canonical: '/pricing' },
};
export default async function PricingPage({ searchParams }) {
  const query = await searchParams;
  const checkoutState = ['success', 'cancelled'].includes(query?.checkout) ? query.checkout : '';
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="vip-glass vip-hero-enter relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <span className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-eviv-lime/10 blur-3xl" aria-hidden="true" />
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-eviv-lime"><Crown className="h-4 w-4" aria-hidden="true" />LIMON LIVE VIP</p>
        <h1 className="mt-4 max-w-xl text-3xl font-black tracking-tight text-white sm:text-5xl">All the football.<br /><span className="text-eviv-lime">None of the noise.</span></h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-zinc-300">Your matchday, your pass. One-time prices in Moroccan dirhams. No automatic renewal. Free standard HD with ads is always an option.</p>
        <div className="mt-6 flex flex-wrap gap-4 text-xs font-bold text-zinc-200">{[[ShieldCheck, 'Ad-free Limon'], [Zap, 'Low-latency FHD / 4K*'], [MonitorPlay, 'Up to 4 screens']].map(([Icon, label]) => <span key={label} className="flex items-center gap-2"><Icon className="h-4 w-4 text-eviv-lime" aria-hidden="true" />{label}</span>)}</div>
      </header>
      <SubscriptionStatus checkoutState={checkoutState} />
      <section aria-label="VIP passes" className="vip-glass rounded-3xl p-4 sm:p-6"><PricingPlans /></section>
      <section className="glass-panel vip-plan-enter flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5" style={{ animationDelay: '480ms' }}>
        <div><h2 className="text-sm font-black">Free, always.</h2><p className="mt-1 text-xs text-navy-500 dark:text-zinc-400">Standard ads · standard HD up to 720p · one screen.</p></div>
        <Link href="/" className="tactile rounded-xl border border-lime-500/30 px-4 py-2 text-xs font-bold text-lime-700 dark:text-lime-300">Browse matches</Link>
      </section>
    </div>
  );
}
