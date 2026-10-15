'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/** Native-style back: returns to the previous screen, or to `fallback` on a fresh visit. */
export default function BackButton({ fallback = '/', label = 'Back', className = '' }) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className={`tactile inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-2xl border border-navy-200 bg-white px-3.5 py-2 text-xs font-bold text-navy-700 shadow-sm hover:border-lime-500/50 hover:text-lime-700 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-300 dark:hover:text-lime-400 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
