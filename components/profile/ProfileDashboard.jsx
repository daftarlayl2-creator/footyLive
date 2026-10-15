'use client';

import { LogOut, MailWarning, ShieldCheck, UserRound } from 'lucide-react';
import { signOut, useAuth } from '@/lib/auth';
import { NICKNAME_STORAGE_KEY } from '@/lib/chat';
import useFanStats from '@/lib/hooks/useFanStats';
import { useLocalValue } from '@/lib/hooks/useLocalValue';
import { playSound } from '@/lib/sound/uiSound';
import ClubLink from '@/components/clubs/ClubLink';
import CrestDrop from '@/components/clubs/CrestDrop';
import UserAvatar from '@/components/auth/UserAvatar';
import VerifiedBadge from '@/components/auth/VerifiedBadge';
import AuthPanel from './AuthPanel';
import AuthReturnNotice from './AuthReturnNotice';
import FanStatsCard from './FanStatsCard';
import ProfileEditor from './ProfileEditor';

function Chip({ tone = 'neutral', children }) {
  const tones = {
    verified: 'border-eviv-lime/40 bg-eviv-burgundy/80 text-eviv-lime',
    pending: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
    level: 'border-lime-500/35 bg-lime-500/10 text-lime-200',
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

function ProfileHero({ auth, guestName, level }) {
  const user = auth.user;
  const name = user?.displayName || guestName || 'Guest fan';
  const club = user?.favoriteClub;

  const handleSignOut = async () => {
    playSound('tap');
    await signOut();
  };

  return (
    <section className="glass-dark relative overflow-hidden rounded-3xl p-5 sm:p-7" aria-labelledby="profile-heading" data-profile-hero="">
      <span className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-lime-500/10 blur-3xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-24 right-0 h-64 w-64 rounded-full bg-navy-600/25 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <UserAvatar name={name} avatarUrl={user?.avatarUrl} size={96} verified={Boolean(user?.verified)} />

        <div className="min-w-0 flex-1">
          {/* One row: a long name truncates, the seal keeps its size right beside it. */}
          <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-start">
            <h1 id="profile-heading" className="min-w-0 truncate text-2xl font-black text-white sm:text-3xl">
              {name}
            </h1>
            {user?.verified && <VerifiedBadge size={26} />}
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

  return (
    <div className="flex flex-col gap-6" data-profile-dashboard={auth.status}>
      <AuthReturnNotice authReturn={authReturn} reason={authReason} />
      {auth.status === 'loading' ? <ProfileSkeleton /> : <>
      <ProfileHero auth={auth} guestName={guestName} level={stats.level} />
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
