'use client';

import { Coins, ShieldCheck, TrendingUp } from 'lucide-react';
import { REWARD_CORRECT_PREDICTION } from '@/lib/coins';
import EvivCoin, { CoinAmount } from './EvivCoin';

/**
 * Wallet card for /profile: the animated EVIV Coin, the server-confirmed
 * balance and the prediction reward ledger (one credit per correctly called
 * full-time result).
 */
export default function WalletCard({ wallet, className = '' }) {
  const balance = Math.max(0, Math.floor(Number(wallet?.balance) || 0));
  const awards = Array.isArray(wallet?.awards) ? wallet.awards : [];
  const lastCredit = wallet?.lastCredit;
  const totalEarned = awards.reduce((sum, award) => sum + (Number(award.coins) || 0), 0);

  return (
    <section
      aria-labelledby="wallet-heading"
      className={`glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-6 ${className}`}
      data-wallet-card=""
    >
      <span className="pointer-events-none absolute -bottom-24 -right-12 h-56 w-56 rounded-full bg-eviv-lime/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-center gap-4">
        <EvivCoin size={76} burst={Boolean(lastCredit)} className="eviv-coin--glow" />
        <div className="min-w-0">
          <h2 id="wallet-heading" className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-300">EVIV Coin wallet</h2>
          <CoinAmount amount={balance} className="mt-1 block text-2xl text-eviv-lime sm:text-3xl" />
          <p className="mt-1 text-[11px] font-semibold text-zinc-300">
            {awards.length
              ? `${awards.length} correct prediction${awards.length === 1 ? '' : 's'} paid · ${totalEarned.toLocaleString('en-US')} coins earned`
              : `Call a full-time result correctly to earn ${REWARD_CORRECT_PREDICTION.toLocaleString('en-US')} coins.`}
          </p>
        </div>
      </div>

      <dl className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: Coins, label: 'Correct calls', value: awards.length },
          { icon: TrendingUp, label: 'Coins earned', value: totalEarned.toLocaleString('en-US') },
          { icon: ShieldCheck, label: 'Server verified', value: 'Yes' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="glass-dark-tile rounded-2xl px-2 py-2.5">
            <Icon className="mx-auto h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
            <dd className="mt-1 text-sm font-black tabular-nums text-white">{value}</dd>
            <dt className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-300">{label}</dt>
          </div>
        ))}
      </dl>

      {awards.length > 0 && (
        <ul role="list" className="relative mt-3 space-y-1.5" aria-label="Recent coin rewards">
          {awards.slice(-3).reverse().map((award) => (
            <li key={award.matchId} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <span className="min-w-0 truncate text-[11px] font-bold text-zinc-200">Match {award.matchId}</span>
              <span className="shrink-0 text-[11px] font-black text-eviv-lime tabular-nums">+{Number(award.coins).toLocaleString('en-US')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
