'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import UserAvatar from './UserAvatar';

/**
 * Header account entry: the fan's avatar (with the verified seal) when signed
 * in, a "Sign in" person icon for guests. Opens /profile.
 */
export default function AccountButton() {
  const { status, user } = useAuth();
  const pathname = usePathname() || '/';
  const active = pathname.startsWith('/profile');
  const signedIn = status === 'authenticated' && user;
  const label = signedIn ? `Your profile — ${user.displayName}` : 'Sign in or create an account';

  return (
    <Link
      href="/profile"
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`tactile inline-flex h-9 items-center justify-center gap-2 rounded-xl border text-xs font-bold ${
        signedIn ? 'pl-1 pr-1 lg:pr-3' : 'w-9 lg:w-auto lg:px-3'
      } ${active ? 'border-lime-500/60 bg-lime-500/10 text-lime-400' : 'border-navy-750 text-zinc-300 hover:border-lime-500/50 hover:bg-lime-500/5 hover:text-lime-400'}`}
      data-account-button=""
    >
      {signedIn ? (
        <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size={28} verified={user.verified} />
      ) : (
        <UserRound className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden max-w-[9rem] truncate lg:inline">{signedIn ? user.displayName : 'Sign in'}</span>
    </Link>
  );
}
