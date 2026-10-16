'use client';

import { useRef, useState } from 'react';
import { Check, Crown, LoaderCircle } from 'lucide-react';
import { PLANS } from '@/lib/subscription/plans';
import { useSubscription } from './SubscriptionProvider';

export default function PricingPlans({ matchId, feature }) {
  const { checkoutAvailable } = useSubscription();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const checkout = async (plan) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(plan.id);
    setError('');
    try {
      // Establish the signed, HttpOnly purchase identity before contacting the merchant.
      const session = await fetch('/api/subscription', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!session.ok) throw new Error('Unable to verify your pass status. Please try again.');
      const response = await fetch('/api/subscription/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, ...(plan.scope === 'match' ? { matchId } : {}) }), signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Checkout is temporarily unavailable.');
      const url = new URL(data.checkoutUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid checkout link.');
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open checkout. No pass has been activated.');
    } finally { submitting.current = false; setPending(null); }
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-pricing-plans="">
        {PLANS.map((plan) => {
          const needsMatch = plan.scope === 'match' && !matchId;
          const incompatible = plan.scope === 'match' && feature === 'multiview';
          const disabled = needsMatch || incompatible || !checkoutAvailable || pending !== null;
          return (
            <article key={plan.id} className={`vip-plan relative flex flex-col rounded-2xl border p-5 ${plan.id === 'monthly' ? 'border-eviv-lime/65 bg-eviv-lime/[0.07]' : 'border-white/15 bg-white/[0.035]'}`} data-plan={plan.id}>
              <p className="text-[10px] font-black uppercase tracking-widest text-eviv-lime">{plan.badge}</p>
              <h3 className="mt-3 min-h-10 text-sm font-extrabold text-white">{plan.name}</h3>
              <p className="mt-4 flex items-baseline gap-1.5"><span className="text-4xl font-black tracking-tight text-white">{plan.price}</span><span className="text-xs font-bold text-zinc-300">MAD</span></p>
              <p className="mt-1 text-[11px] text-zinc-400">{plan.period} · one-time payment</p>
              <ul className="my-5 space-y-2 text-xs text-zinc-200">
                {['Ad-free EVIV experience', 'Low-latency FHD / 4K*', 'No viewing session timeouts', plan.scope === 'match' ? 'VIP for your selected fixture' : 'All matches + 4-screen Multi-View'].map((text) => <li key={text} className="flex items-start gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-eviv-lime" aria-hidden="true" />{text}</li>)}
              </ul>
              <button type="button" disabled={disabled} onClick={() => checkout(plan)} className="lime-cta tactile mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-45" aria-label={`Choose ${plan.name} for ${plan.price} MAD`}>
                {pending === plan.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Crown className="h-4 w-4" aria-hidden="true" />}
                {pending === plan.id ? 'Opening checkout…' : 'Choose pass'}
              </button>
              {(needsMatch || incompatible) && <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">{incompatible ? 'Multi-View requires a Weekly, Monthly or Annual pass.' : 'Select this pass from a live or upcoming match page.'}</p>}
            </article>
          );
        })}
      </div>
      {!checkoutAvailable && <p role="status" className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">Checkout is not available on this deployment yet. Free HD remains available; no payment will be taken.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
      <p className="mt-4 text-[10px] leading-relaxed text-zinc-400">*Resolution and low latency depend on the source and your connection. No upscaling or invented 4K sources. VIP removes EVIV advertisements; broadcaster-inserted content is outside our control. A Single Match Pass lasts up to 24 hours for one fixture and does not unlock other matches or Multi-View. Passes do not auto-renew.</p>
    </div>
  );
}
