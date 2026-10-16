'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { subscriptionAccess } from '@/lib/subscription/plans';

const DEFAULT = { grants: [], checkoutAvailable: false, unavailable: false, refresh: async () => {} };
const SubscriptionContext = createContext(DEFAULT);

/** Server-seeded to suppress ads before any third-party script is mounted for VIP fans. */
export default function SubscriptionProvider({ initial = DEFAULT, children }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/subscription', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.grants)) throw new Error('Pass verification unavailable');
      setSnapshot({ grants: data.grants, checkoutAvailable: Boolean(data.checkoutAvailable), unavailable: false });
      setNow(Date.now());
    } catch {
      if (!signal?.aborted) setSnapshot((current) => ({ ...current, unavailable: true }));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const check = async () => {
      if (document.hidden || busy || controller.signal.aborted) return;
      busy = true;
      try { await refresh(controller.signal); } finally { busy = false; }
    };
    // A return from hosted checkout must be verified; ?checkout=success alone grants nothing.
    check();
    const timer = setInterval(check, 30_000);
    window.addEventListener('focus', check);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', check); };
  }, [refresh]);
  useEffect(() => {
    const next = snapshot.grants.filter((grant) => grant.expiresAt > now).map((grant) => grant.expiresAt);
    if (!next.length) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(1, Math.min(...next) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [snapshot.grants, now]);
  const adFree = subscriptionAccess(snapshot.grants, undefined, now).adFree;
  useEffect(() => {
    document.documentElement.dataset.vipAdFree = String(adFree);
    return () => { delete document.documentElement.dataset.vipAdFree; };
  }, [adFree]);
  const value = useMemo(() => ({ ...snapshot, now, refresh }), [snapshot, now, refresh]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}
export function useSubscription(matchId) {
  const context = useContext(SubscriptionContext);
  return { ...context, access: subscriptionAccess(context.grants, matchId, context.now) };
}
