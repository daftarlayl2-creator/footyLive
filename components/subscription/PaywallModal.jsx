'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Crown, X } from 'lucide-react';
import PricingPlans from './PricingPlans';

/** Accessible, focus-contained glass paywall. Unmounted while closed: no hidden checkout work. */
export default function PaywallModal({ onClose, matchId, feature = 'quality' }) {
  const heading = useId();
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = panel.current;
    root?.querySelector('button')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')];
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="vip-paywall fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-md sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} data-paywall="">
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={heading} className="vip-glass relative my-auto max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-3xl p-5 text-zinc-100 sm:p-8">
        <button type="button" onClick={onClose} aria-label="Close VIP plans" className="tactile absolute right-4 top-4 rounded-xl border border-white/15 p-2 text-zinc-300 hover:text-white"><X className="h-4 w-4" aria-hidden="true" /></button>
        <Crown className="mb-3 h-8 w-8 text-eviv-lime" aria-hidden="true" />
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-eviv-lime">LIMON LIVE VIP</p>
        <h2 id={heading} className="mb-2 mt-2 pr-8 text-2xl font-black text-white">{feature === 'multiview' ? 'Four screens. One matchday.' : 'The game. Without interruptions.'}</h2>
        <p className="mb-6 max-w-2xl text-sm text-zinc-300">{feature === 'multiview' ? 'Unlock 4-screen Multi-View with a Weekly, Monthly or Annual VIP pass.' : 'Go ad-free and unlock low-latency FHD / 4K where available. Keep watching in standard HD for free.'}</p>
        <PricingPlans matchId={matchId} feature={feature} />
        <button type="button" onClick={onClose} className="tactile mt-5 text-xs font-bold text-zinc-300 underline underline-offset-4">Continue with free HD</button>
      </section>
    </div>, document.body,
  );
}
