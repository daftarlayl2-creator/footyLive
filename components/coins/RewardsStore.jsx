'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Check, Crown, Gift, Inbox, Loader2, Lock, Sparkles, Store } from 'lucide-react';
import { COIN_NAME, VIP_PASS_COIN_COST, VIP_PASS_DURATION_DAYS, canRedeemReward, rewardShortfall } from '@/lib/coins';
import { RARITY_STYLE, REWARD_LIST } from '@/lib/rewards/catalog';
import { playSound } from '@/lib/sound/uiSound';
import EvivCoin, { CoinAmount } from './EvivCoin';

/**
 * Rewards Store (الهدايا): spend earned Limon Coins on real perks.
 *
 * The headline reward is still **20,000 coins = 1 month of VIP, free**, but the
 * whole menu is redeemable now: every card is rendered from the catalogue the
 * server sells (`/api/wallet` → `catalog`, with the shared
 * `lib/rewards/catalog.ts` list as the first-paint fallback), so the UI can never
 * advertise a reward the redemption engine refuses.
 *
 * A redemption is one server call: the price is checked against the stored
 * balance, the coins are deducted and the perk (VIP window, flair or boost
 * charges) is granted in the same atomic write, and the receipt lands in the
 * fan's inbox. A tampered client cannot buy what it cannot afford.
 */
export const REWARDS = REWARD_LIST.map((reward) => ({
  id: reward.id,
  title: reward.title,
  cost: reward.cost,
  days: reward.days ?? 0,
  blurb: reward.blurb,
  perk: reward.perk,
  featured: Boolean(reward.featured),
  kind: reward.kind,
  rarity: reward.rarity,
  titleAr: reward.titleAr,
}));

const KIND_LABEL = { vip: 'Access', badge: 'Badge', boost: 'Boost' };

function RewardCard({ reward, balance, busy, onRedeem, active, owned, live }) {
  const affordable = canRedeemReward(balance, reward.id);
  const shortfall = rewardShortfall(balance, reward.id);
  const progress = Math.min(100, Math.round((balance / reward.cost) * 100));
  const style = RARITY_STYLE[reward.rarity] ?? RARITY_STYLE.common;

  return (
    <li
      className={`glass-dark lemon-reward-card relative overflow-hidden rounded-3xl border p-4 ${
        reward.featured ? 'border-eviv-lime/40' : 'border-white/10'
      } ring-1 ${style.ring}`}
      data-reward={reward.id}
      data-affordable={String(affordable)}
      data-owned={String(Boolean(owned))}
    >
      {reward.featured && (
        <span className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-eviv-lime/15 blur-3xl" aria-hidden="true" />
      )}
      <div className="relative flex items-start gap-3">
        <EvivCoin size={44} spin={reward.featured} burst={active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-black text-white">{reward.title}</h4>
            <span className={`shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${style.className}`}>
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">{reward.blurb}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-eviv-lime">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {reward.perk}
          </p>
          {live ? (
            <p className="mt-1 text-[10px] font-bold text-lime-200" data-reward-live={reward.id}>
              {reward.kind === 'vip' ? `Active until ${live}` : `On your account${owned ? ' ✓' : ''}`}
            </p>
          ) : null}
        </div>
        <CoinAmount amount={reward.cost} className="shrink-0 text-xs text-zinc-100" />
      </div>

      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-amber-300 via-lime-300 to-eviv-lime transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => onRedeem(reward)}
        disabled={busy || owned || !affordable}
        aria-label={`Redeem ${reward.title} for ${reward.cost} ${COIN_NAME}s`}
        className={`tactile mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:cursor-not-allowed ${
          owned
            ? 'border border-eviv-lime/35 bg-eviv-lime/10 text-eviv-lime'
            : affordable
              ? 'lime-cta'
              : 'border border-white/10 bg-white/5 text-zinc-400'
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : owned ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : affordable ? (
          <Gift className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Lock className="h-4 w-4" aria-hidden="true" />
        )}
        {owned
          ? 'Owned · live on your account'
          : affordable
            ? `Redeem · ${reward.cost.toLocaleString('en-US')} coins`
            : `${shortfall.toLocaleString('en-US')} more coins needed`}
      </button>
    </li>
  );
}

export default function RewardsStore({ wallet, className = '' }) {
  const [message, setMessage] = useState(null);
  const [lastRedeemed, setLastRedeemed] = useState(null);
  const { balance = 0, busy = false, redeem, error, grants = [] } = wallet || {};

  // Prefer the server's own catalogue so a price/id can never drift from the
  // redemption engine; fall back to the shared list for the first paint.
  const rewards = useMemo(() => {
    const catalog = Array.isArray(wallet?.catalog) && wallet.catalog.length ? wallet.catalog : null;
    if (!catalog) return REWARDS;
    return catalog.map((row) => {
      const known = REWARDS.find((reward) => reward.id === row.id);
      return { ...known, ...row, blurb: known?.blurb ?? '', featured: Boolean(row.featured) };
    });
  }, [wallet?.catalog]);

  const grantFor = (id) => grants.find((grant) => grant.rewardId === id);

  const handleRedeem = async (reward) => {
    setMessage(null);
    setLastRedeemed(null);
    playSound('tap');
    const result = await redeem?.(reward.id);
    if (result?.ok) {
      setLastRedeemed(reward.id);
      playSound('success');
      setMessage({
        tone: 'ok',
        text: `${reward.title} unlocked — ${reward.cost.toLocaleString('en-US')} coins deducted and the perk is live on your account now. A receipt was filed in your inbox.`,
      });
    } else {
      playSound('error');
      setMessage({
        tone: 'bad',
        text: result?.payload?.error || result?.payload?.message || error || 'Redemption failed — your coins are safe.',
        reason: result?.payload?.reason,
      });
    }
  };

  // `vipActive` comes from the server payload (server clock), so the render
  // stays pure and the badge cannot be faked by editing local state.
  const vipActive = Boolean(wallet?.vipActive);
  const vipExpires = wallet?.vipExpiresAt ? new Date(wallet.vipExpiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null;
  const boostCharges = Number(wallet?.boostCharges) || 0;

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
            <p className="text-[11px] font-semibold text-zinc-300">Spend {COIN_NAME}s earned from correct predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vipActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-eviv-lime/40 bg-eviv-burgundy/80 px-2.5 py-1 text-[11px] font-bold text-eviv-lime">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> VIP active{vipExpires ? ` · ${vipExpires}` : ''}
            </span>
          )}
          {boostCharges > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold text-amber-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {boostCharges} boost{boostCharges === 1 ? '' : 'es'} armed
            </span>
          )}
          <span className="glass-dark-tile inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold text-zinc-100">
            <Crown className="h-3.5 w-3.5 text-eviv-lime" aria-hidden="true" />
            Balance <CoinAmount amount={balance} className="text-eviv-lime" />
          </span>
        </div>
      </div>

      <p className="relative mt-3 rounded-2xl border border-eviv-lime/25 bg-eviv-burgundy/50 px-3.5 py-2.5 text-[11px] font-semibold text-zinc-200">
        <span className="font-black text-eviv-lime">20,000 coins = 1 month of VIP, free.</span>{' '}
        Redeem for VIP passes, collector badges and prediction boosts. Prices, balances and grants are validated on the server — and every purchase writes a receipt to your{' '}
        <Link href="/inbox" className="font-black text-eviv-lime underline decoration-eviv-lime/40 underline-offset-2 hover:decoration-eviv-lime">inbox</Link>.
      </p>

      <ul role="list" className="relative mt-4 grid gap-3 sm:grid-cols-2">
        {rewards.map((reward) => {
          const grant = grantFor(reward.id);
          return (
            <RewardCard
              key={reward.id}
              reward={reward}
              balance={balance}
              busy={busy}
              active={lastRedeemed === reward.id}
              owned={Boolean(grant) && reward.kind === 'badge'}
              live={grant?.expiresAt ? new Date(grant.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : grant ? 'always' : null}
              onRedeem={handleRedeem}
            />
          );
        })}
      </ul>

      <p className="relative mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
        {KIND_LABEL.vip}: deducted and granted in one atomic write · {KIND_LABEL.badge}: permanent · {KIND_LABEL.boost}: consumed by the server on the next correct call
      </p>

      {message && (
        <div
          role="status"
          className={`relative mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            message.tone === 'ok'
              ? 'border-eviv-lime/40 bg-eviv-lime/10 text-eviv-lime'
              : 'border-red-500/35 bg-red-500/10 text-red-200'
          }`}
        >
          <span>{message.text}</span>
          {message.tone === 'ok' ? (
            <Link href="/inbox" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-eviv-lime/40 px-2 py-0.5 text-[10px] font-black text-eviv-lime hover:bg-eviv-lime/10">
              <Inbox className="h-3 w-3" aria-hidden="true" /> Receipt
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
