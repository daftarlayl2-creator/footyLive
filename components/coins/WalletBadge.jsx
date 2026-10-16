'use client';

import Link from 'next/link';
import useWallet from '@/lib/hooks/useWallet';
import EvivCoin from './EvivCoin';

/**
 * Header wallet chip: the animated 3D Limon Coin plus the server-confirmed balance,
 * linking to the Rewards Store on /profile. The number is read from the backend
 * (never from a local flag), so Inspect Element edits cannot change it.
 */
export default function WalletBadge({ className = '' }) {
  const { balance, loaded, lastCredit } = useWallet({ autoSettle: false });
  const display = Number.isFinite(balance) ? balance : 0;

  return (
    <Link
      href="/profile#rewards"
      aria-label={`Limon Coin wallet — ${display.toLocaleString('en-US')} coins. Open the Rewards Store.`}
      title="Limon Coin wallet · Rewards Store"
      className={`tactile inline-flex h-9 items-center gap-1.5 rounded-xl border border-eviv-lime/30 bg-eviv-burgundy/60 px-2 text-xs font-black text-eviv-lime hover:border-eviv-lime/60 hover:bg-eviv-burgundy/80 ${className}`}
      data-wallet-badge={loaded ? 'ready' : 'loading'}
    >
      <EvivCoin size={20} burst={Boolean(lastCredit)} />
      <span className="tabular-nums">{display.toLocaleString('en-US')}</span>
      <span className="hidden text-[9px] font-extrabold uppercase tracking-wider opacity-80 lg:inline">Limon</span>
    </Link>
  );
}
