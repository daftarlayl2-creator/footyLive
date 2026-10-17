import BrandLogo from '@/components/BrandLogo';

/**
 * Shared shell for the informational / legal pages (Phase 9). Compact,
 * readable, brand-consistent. `updated` states when the text was drafted —
 * the owner must confirm legal details before relying on these pages.
 */
export default function LegalPage({ title, intro, updated = 'October 2026', children }) {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 py-4" data-legal-page>
      <header className="space-y-3">
        <BrandLogo />
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 dark:text-zinc-50 sm:text-3xl">{title}</h1>
        {intro ? <p className="text-sm leading-relaxed text-navy-600 dark:text-zinc-300">{intro}</p> : null}
        <p className="text-[11px] font-semibold uppercase tracking-widest text-navy-400 dark:text-zinc-500">Last updated: {updated}</p>
      </header>
      <div className="space-y-5 text-sm leading-relaxed text-navy-700 dark:text-zinc-200 [&_a]:font-semibold [&_a]:text-lime-700 [&_a]:underline dark:[&_a]:text-lime-400 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-navy-900 dark:[&_h2]:text-zinc-50 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}
