'use client';

import { Cake, LogOut, MailWarning, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react';
import Link from 'next/link';
import { signOut, useAuth } from '@/lib/auth';
import { NICKNAME_STORAGE_KEY } from '@/lib/chat';
import useFanStats from '@/lib/hooks/useFanStats';
import { useLocalValue } from '@/lib/hooks/useLocalValue';
import { playSound } from '@/lib/sound/uiSound';
import { ageFromBirthdate, findCountry } from '@/lib/geo/countries';
import { vipTierFromGrants } from '@/lib/vip/tiers';
import { useSubscription } from '@/components/subscription/SubscriptionProvider';
import ClubLink from '@/components/clubs/ClubLink';
import CrestDrop from '@/components/clubs/CrestDrop';
import UserAvatar from '@/components/auth/UserAvatar';
import VerifiedBadge from '@/components/auth/VerifiedBadge';
import VipBadge from '@/components/auth/VipBadge';
import WalletCard from '@/components/coins/WalletCard';
import RewardsStore from '@/components/coins/RewardsStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import useWallet from '@/lib/hooks/useWallet';
import AuthPanel from './AuthPanel';
import AuthReturnNotice from './AuthReturnNotice';
import FanStatsCard from './FanStatsCard';
import ProfileEditor from './ProfileEditor';
import WavingFlag from './WavingFlag';

function Chip({ tone = 'neutral', children }) {
  const tones = {
    verified: 'border-eviv-lime/40 bg-eviv-burgundy/80 text-eviv-lime',
    pending: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
    level: 'border-lime-500/35 bg-lime-500/10 text-lime-200',
    vip: 'border-amber-300/40 bg-gradient-to-r from-amber-400/15 to-eviv-lime/10 text-amber-100',
    country: 'border-white/15 bg-white/10 text-zinc-100',
    neutral: 'border-white/10 bg-white/5 text-zinc-200',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading profile">
      <div className="glass-dark h-48 animate-pulse rounded-3xl motion-reduce:animate-none" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-dark h-96 animate-pulse rounded-3xl motion-reduce:animate-none" />
        <div className="glass-dark h-96 animate-pulse rounded-3xl motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function ProfileHero({ auth, guestName, level, vipTier }) {
  const user = auth.user;
  const name = user?.displayName || guestName || 'Guest fan';
  const club = user?.favoriteClub;
  const country = findCountry(user?.countryCode);
  const age = ageFromBirthdate(user?.birthdate);

  const handleSignOut = async () => {
    playSound('tap');
    await signOut();
  };

  return (
    <section className="glass-dark profile-hero-enter relative overflow-hidden rounded-3xl p-5 sm:p-7" aria-labelledby="profile-heading" data-profile-hero="">
      <span className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-lime-500/10 blur-3xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-24 right-0 h-64 w-64 rounded-full bg-navy-600/25 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <UserAvatar name={name} avatarUrl={user?.avatarUrl} size={96} verified={Boolean(user?.verified)} />

        <div className="min-w-0 flex-1">
          {/* One row: a long name truncates, the seal keeps its size right beside it.
              The fan's country flag waves right after the name + badges. */}
          <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-start">
            <h1 id="profile-heading" className="min-w-0 truncate text-2xl font-black text-white sm:text-3xl">
              {name}
            </h1>
            {user?.verified && <VerifiedBadge size={26} />}
            {vipTier && <VipBadge tier={vipTier} size={26} />}
            {country && <WavingFlag code={country.code} size={30} className="shrink-0" />}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {user ? (
              user.verified ? (
                <Chip tone="verified">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified fan
                </Chip>
              ) : (
                <Chip tone="pending">
                  <MailWarning className="h-3.5 w-3.5" aria-hidden="true" /> Email confirmation pending
                </Chip>
              )
            ) : (
              <Chip>
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Guest
              </Chip>
            )}
            {vipTier && (
              <Chip tone="vip">
                <VipBadge tier={vipTier} size={14} /> {vipTier.label}
              </Chip>
            )}
            {country && (
              <Chip tone="country">
                <WavingFlag code={country.code} size={16} /> {country.name}
              </Chip>
            )}
            {age !== null && user && (
              <Chip>
                <Cake className="h-3.5 w-3.5 text-lime-300" aria-hidden="true" /> {age} years old
              </Chip>
            )}
            <Chip tone="level">
              Lv {level.level} · {level.title}
            </Chip>
            <Chip>{user ? (auth.provider === 'supabase' ? 'Synced account' : 'Account on this device') : 'Not signed in'}</Chip>
          </div>
          <p className="mt-2 truncate text-sm text-zinc-300">
            {user ? user.email : 'Create a free account to claim your name, earn the verified badge and keep your stats.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3">
          {club ? (
            <ClubLink team={club} prefetch={false} className="tactile group flex flex-col items-center gap-1.5 rounded-2xl px-2 py-1">
              <CrestDrop src={club.badge} name={club.name} size="lg" tone="dark" />
              <span className="max-w-[9rem] truncate text-xs font-extrabold text-white group-hover:text-lime-200">{club.name}</span>
              <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-zinc-300">Favourite club</span>
            </ClubLink>
          ) : user ? (
            <p className="max-w-[10rem] text-center text-[11px] font-semibold text-zinc-300">Pick your favourite club below</p>
          ) : null}
          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className="tactile inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-100 hover:border-red-500/40 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * /profile: Guest vs registered fan. Guests can sign up / sign in (or keep a
 * chat nickname); registered fans edit their display name, avatar and
 * primary favourite club, and everyone gets the Fan Stats card.
 */
export default function ProfileDashboard({ authReturn = null, authReason = null }) {
  const auth = useAuth();
  const stats = useFanStats();
  const guestName = useLocalValue(NICKNAME_STORAGE_KEY);
  // The viewer's highest active pass picks their VIP tier badge (server-verified grants).
  const { grants } = useSubscription();
  const vipTier = vipTierFromGrants(grants);
  // Every match this fan has voted on is handed to the server, which verifies
  // the final score and credits coins for the correct calls (never the client).
  const wallet = useWallet({ settleMatchIds: (stats.votes || []).map((vote) => vote.matchId) });

  return (
    <div className="flex flex-col gap-6" data-profile-dashboard={auth.status}>
      <AuthReturnNotice authReturn={authReturn} reason={authReason} />
      {/* Gamification shortcuts: daily wheel + global predictor leaderboard. */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/spin" data-sound="tab" className="tactile group flex items-center gap-3 rounded-2xl border border-lime-500/30 bg-lime-500/10 px-4 py-3 transition-colors hover:border-lime-400/50">
          <Sparkles className="h-5 w-5 shrink-0 text-lime-500 dark:text-lime-300" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-black text-navy-900 dark:text-white">Daily Lemon Wheel</span>
            <span className="block truncate text-[10px] font-semibold text-navy-500 dark:text-zinc-400">Spin every 24h — coins &amp; VIP</span>
          </span>
        </Link>
        <Link href="/leaderboard" data-sound="tab" className="tactile group flex items-center gap-3 rounded-2xl border border-navy-200 bg-white/60 px-4 py-3 transition-colors hover:border-lime-500/40 dark:border-white/10 dark:bg-white/5">
          <Trophy className="h-5 w-5 shrink-0 text-lime-500 dark:text-lime-300" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-black text-navy-900 dark:text-white">Predictor Leaderboard</span>
            <span className="block truncate text-[10px] font-semibold text-navy-500 dark:text-zinc-400">Streaks, accuracy &amp; badges</span>
          </span>
        </Link>
      </div>
      {/* The wallet and the Rewards Store are server-backed and independent of
          the sign-in state, so they paint on the first frame. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <WalletCard wallet={wallet} />
        <ErrorBoundary name="rewards-drawer" title="Rewards Store hit a snag" message="The rewards catalogue could not be loaded right now. Your wallet balance is safe — try opening the store again.">
          <RewardsStore wallet={wallet} />
        </ErrorBoundary>
      </div>
      {auth.status === 'loading' ? <ProfileSkeleton /> : <>
      <ProfileHero auth={auth} guestName={guestName} level={stats.level} vipTier={vipTier} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {auth.user ? (
          <ProfileEditor key={auth.user.id} user={auth.user} favorites={stats.favorites} />
        ) : (
          <AuthPanel provider={auth.provider} guestName={guestName} initialMode={authReturn ? 'signin' : 'signup'} />
        )}
        <FanStatsCard stats={stats} />
      </div>
      </>}
    </div>
  );
}
