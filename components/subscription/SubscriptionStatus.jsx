'use client';

import Link from 'next/link';
import { Crown, RefreshCw } from 'lucide-react';
import { getPlan } from '@/lib/subscription/plans';
import LocalDateTime from '@/components/ui/LocalDateTime';
import { useSubscription } from './SubscriptionProvider';

/** A hosted-checkout return is a status message, never proof of payment. */
export default function SubscriptionStatus({ checkoutState = '' }) {
  const { grants, now = 0, unavailable, refresh } = useSubscription();
  const active = grants.filter((grant) => grant.startsAt <= now && grant.expiresAt > now);
  if (!active.length && !checkoutState && !unavailable) return null;
  return (
    <section className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5" aria-label="Your pass status">
      <div className="min-w-0 space-y-2 text-xs">
        {active.length ? active.map((grant) => <p key={grant.id} className="flex flex-wrap items-center gap-2 font-bold">
          <Crown className="h-4 w-4 shrink-0 text-lime-600 dark:text-eviv-lime" aria-hidden="true" />
          {getPlan(grant.planId)?.name} · active until <LocalDateTime iso={new Date(grant.expiresAt).toISOString()} />
          {grant.matchId && <Link href={`/watch/${encodeURIComponent(grant.matchId)}`} className="underline underline-offset-4">Open your fixture</Link>}
        </p>) : <p role="status">{checkoutState === 'cancelled' ? 'Checkout was cancelled. No pass has been activated.' : 'Waiting for verified payment confirmation. Returning from checkout alone does not activate a pass.'}</p>}
        {unavailable && <p role="status" className="text-amber-700 dark:text-amber-200">Pass verification is temporarily unavailable. Please refresh your status shortly.</p>}
        <p className="text-[11px] text-navy-500 dark:text-zinc-400">Passes are linked to this browser’s secure purchase cookie. Keep it to retain access.</p>
      </div>
      <button type="button" onClick={() => refresh()} className="tactile flex items-center gap-2 rounded-xl border border-lime-500/30 px-3 py-2 text-xs font-bold text-lime-700 dark:text-lime-300"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh pass status</button>
    </section>
  );
}
