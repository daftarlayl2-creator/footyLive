'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Goal, Layers, Radio, Trophy } from 'lucide-react';
import { PRIMARY_NAV, activeNavKey } from '@/lib/navigation';

const ICONS = { matches: Goal, channels: Radio, standings: Trophy, multiview: Layers };

/**
 * Mobile-only sticky tab bar (Material 3 / Flutter NavigationBar style):
 * glass surface, pill indicator behind the active icon, springy presses and
 * safe-area padding for the iOS home indicator.
 */
export default function MobileBottomNav() {
  const active = activeNavKey(usePathname());

  return (
    <nav aria-label="Primary" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[70] md:hidden">
      {/* Dark glass chrome in both themes, matching the header and the ad dock. */}
      <div className="rounded-t-3xl border-t border-white/[0.08] bg-navy-950/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_34px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl backdrop-saturate-150">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4 px-1.5">
          {PRIMARY_NAV.map((item) => {
            const Icon = ICONS[item.key];
            const isActive = item.key === active;
            return (
              <li key={item.key} className="flex">
                <Link
                  href={item.href}
                  data-sound="tab"
                  aria-current={isActive ? 'page' : undefined}
                  className="tactile group flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl outline-offset-[-4px]"
                >
                  <span
                    className={`flex h-7 w-14 items-center justify-center rounded-full transition-all duration-300 ease-spring ${
                      isActive
                        ? 'bg-lime-500 text-navy-950 shadow-glow-lime'
                        : 'text-zinc-400 group-hover:bg-lime-500/10'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                  </span>
                  <span
                    className={`max-w-full truncate px-0.5 text-[10.5px] font-bold tracking-wide transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
