'use client';

import { useCallback, useState } from 'react';
import { Crown, LockKeyhole } from 'lucide-react';
import { useSubscription } from './SubscriptionProvider';
import PaywallModal from './PaywallModal';

export default function PremiumButton({ matchId, feature = 'quality', className = '' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { access } = useSubscription(matchId);
  const unlocked = feature === 'multiview' ? access.multiView : access.tier === 'vip';
  return <>
    <button type="button" onClick={() => setOpen(true)} className={`tactile inline-flex items-center gap-2 rounded-xl border border-eviv-lime/30 bg-eviv-lime/5 px-3 py-2 text-xs font-extrabold text-eviv-lime ${className}`}>
      {unlocked ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}
      {unlocked ? 'VIP active · manage pass' : feature === 'multiview' ? 'Unlock 4-screen Multi-View' : 'Unlock ad-free FHD / 4K'}
    </button>
    {open && <PaywallModal onClose={close} matchId={matchId} feature={feature} />}
  </>;
}
