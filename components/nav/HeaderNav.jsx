'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Goal, Layers, Play, Radio, Trophy } from 'lucide-react';
import { PRIMARY_NAV, activeNavKey } from '@/lib/navigation';

const ICONS = { matches: Goal, channels: Radio, standings: Trophy, multiview: Layers };

const BASE = 'tactile h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold';
// The header is dark chrome in both themes, so these styles are theme-independent.
const IDLE = 'border-navy-750 text-zinc-300 hover:border-lime-500/50 hover:bg-lime-500/5 hover:text-lime-400';
const ACTIVE = 'border-lime-500/60 bg-lime-500/10 text-lime-400';

/**
 * Header links. The four primary destinations live in the mobile bottom tab
 * bar, so on phones only Highlights stays in the header; tablets get compact
 * icon buttons and labels appear from the `lg` breakpoint.
 */
export default function HeaderNav() {
  const pathname = usePathname() || '/';
  const active = activeNavKey(pathname);
  const highlightsActive = pathname.startsWith('/highlights');

  return (
    <>
      {PRIMARY_NAV.map((item) => {
        const Icon = ICONS[item.key];
        const isActive = item.key === active;
        if (item.key === 'multiview') {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`lime-cta tactile hidden h-9 w-9 items-center justify-center gap-1.5 rounded-xl px-0 text-xs font-bold md:inline-flex lg:w-auto lg:px-3.5 ${
                isActive ? 'ring-2 ring-lime-300/60' : ''
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`${BASE} ${isActive ? ACTIVE : IDLE} hidden w-9 px-0 md:inline-flex lg:w-auto lg:px-3`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
      <Link
        href="/highlights"
        aria-label="Highlights"
        aria-current={highlightsActive ? 'page' : undefined}
        title="Highlights"
        className={`${BASE} ${highlightsActive ? ACTIVE : IDLE} inline-flex w-9 px-0 lg:w-auto lg:px-3`}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        <span className="hidden lg:inline">Highlights</span>
      </Link>
    </>
  );
}
