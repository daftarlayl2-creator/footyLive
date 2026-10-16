'use client';

import { useState } from 'react';
import { BadgeCheck, Crown, Gift, Loader2, Lock, Sparkles, Store } from 'lucide-react';
import { VIP_PASS_COIN_COST, VIP_PASS_DURATION_DAYS } from '@/lib/coins';
import { playSound } from '@/lib/sound/uiSound';
import EvivCoin, { CoinAmount } from './EvivCoin';

/**
 * Rewards Store (الهدايا): redeem earned EVIV Coins for real perks.
 *
 * The headline reward is the **1-month free VIP pass for 20,000 EVIV Coins**.
 * Redemption is a server call — the balance, the price and the resulting grant
 * are all validated in `/api/wallet`, so a tampered client cannot buy a pass it
 * cannot afford, and the pass it does buy really unlocks VIP access.
 */
export const REWARDS = [
  {
    id: 'vip-1-month',
    title: 'VIP Pass · 1 month',
    cost: VIP_PASS_COIN_COST,
    days: VIP_PASS_DURATION_DAYS,
    blurb: 'Ad-free FHD/4K where available, low-latency native playback and four-screen Multi-View.',
    perk: 'Full site-wide VIP access',
    featured: true,
  },
  {
    id: 'vip-1-week',
    title: 'VIP Pass · 7 days',
    cost: 6000,
    days: 7,
    blurb: 'A week of ad-free football — good for a busy run of fixtures.',
    perk: '7 days ad-free',
  },
  {
    id: 'coin-badge',
    title: 'EVIV Supporter badge',
    cost: 2500,
    blurb: 'A glowing supporter flair next to your name in match chat and on your profile.',
    perk: 'Cosmetic flair',
  },
  {
    id: 'coin-boost',
    title: 'Prediction boost',
    cost: 1500,
    blurb: 'Doubles the coin reward on your next correct full-time prediction.',
    perk: 'x2 next reward',
  },
];

function RewardCard({ reward, balance, busy, onRedeem, active }) {
  const affordable = balance >= reward.cost;
  const progress = Math.min(100, Math.round((balance / reward.cost) * 100));
  return (
    <li
      className={`glass-dark relative overflow-hidden rounded-3xl border p-4 ${
        reward.featured ? 'border-eviv-lime/40' : 'border-white/10'
      }`}
      data-reward={reward.id}
      data-affordable={String(affordable)}
    >
      {reward.featured && (
        <span className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-eviv-lime/15 blur-3xl" aria-hidden="true" />
      )}
      <div className="relative flex items-start gap-3">
        <EvivCoin size={44} spin={reward.featured} burst={active} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-black text-white">{reward.title}</h4>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">{reward.blurb}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-eviv-lime">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {reward.perk}
          </p>
        </div>
        <CoinAmount amount={reward.cost} className="shrink-0 text-xs text-zinc-100" />
      </div>

      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-lime-600 to-eviv-lime transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => onRedeem(reward)}
        disabled={busy || !affordable}
        aria-label={`Redeem ${reward.title} for ${reward.cost} EVIV Coins`}
        className={`tactile mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:cursor-not-allowed ${
          affordable
            ? 'lime-cta'
            : 'border border-white/10 bg-white/5 text-zinc-400'
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : affordable ? <Gift className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
        {affordable ? `Redeem · ${reward.cost.toLocaleString('en-US')} coins` : `${(reward.cost - balance).toLocaleString('en-US')} more coins needed`}
      </button>
    </li>
  );
}

export default function RewardsStore({ wallet, className = '' }) {
  const [message, setMessage] = useState(null);
  const [lastRedeemed, setLastRedeemed] = useState(null);
  const { balance = 0, busy = false, redeem, error } = wallet || {};

  const handleRedeem = async (reward) => {
    setMessage(null);
    setLastRedeemed(null);
    playSound('tap');
    const result = await redeem?.(reward.id);
    if (result?.ok) {
      setLastRedeemed(reward.id);
      playSound('success');
      setMessage({ tone: 'ok', text: `${reward.title} unlocked — enjoy the football!` });
    } else {
      playSound('error');
      setMessage({ tone: 'bad', text: result?.payload?.error || error || 'Redemption failed.' });
    }
  };

  // `vipActive` comes from the server payload (server clock), so the render
  // stays pure and the badge cannot be faked by editing local state.
  const vipActive = Boolean(wallet?.vipActive);

  return (
    <section id="rewards" aria-labelledby="rewards-heading" className={`glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-6 ${className}`} data-rewards-store="">
      <span className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-eviv-lime/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-eviv-lime/15 text-eviv-lime">
            <Store className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="rewards-heading" className="text-sm font-extrabold tracking-tight text-white">Rewards Store</h2>
            <p className="text-[11px] font-semibold text-zinc-300">Spend EVIV Coins earned from correct predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vipActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-eviv-lime/40 bg-eviv-burgundy/80 px-2.5 py-1 text-[11px] font-bold text-eviv-lime">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> VIP active
            </span>
          )}
          <span className="glass-dark-tile inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold text-zinc-100">
            <Crown className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
            Balance <CoinAmount amount={balance} className="text-eviv-lime" />
          </span>
        </div>
      </div>

      <p className="relative mt-3 rounded-2xl border border-eviv-lime/25 bg-eviv-burgundy/50 px-3.5 py-2.5 text-[11px] font-semibold text-zinc-200">
        <span className="font-black text-eviv-lime">{(VIP_PASS_COIN_COST).toLocaleString('en-US')} coins = 1 month of VIP, free.</span>{' '}
        Redeem your EVIV Coins for a 1-month VIP pass, week passes, chat flair and prediction boosts. Every redemption is validated on the server.
      </p>

      <ul role="list" className="relative mt-4 grid gap-3 sm:grid-cols-2">
        {REWARDS.map((reward) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            balance={balance}
            busy={busy}
            active={lastRedeemed === reward.id}
            onRedeem={handleRedeem}
          />
        ))}
      </ul>

      {message && (
        <p
          role="status"
          className={`relative mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            message.tone === 'ok'
              ? 'border-eviv-lime/40 bg-eviv-lime/10 text-eviv-lime'
              : 'border-red-500/35 bg-red-500/10 text-red-200'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
