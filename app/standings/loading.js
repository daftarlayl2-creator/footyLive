/** Instant skeleton while the standings page streams in. */
export default function StandingsLoading() {
  return (
    <div className="space-y-4 sm:space-y-5" aria-busy="true" aria-label="Loading standings">
      <div className="app-card flex items-center gap-4 p-5 sm:p-6">
        <span className="skeleton h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <span className="skeleton block h-3 w-28 rounded-md" />
          <span className="skeleton block h-7 w-48 rounded-lg" />
          <span className="skeleton block h-3 w-40 rounded-md" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="skeleton h-9 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <span className="skeleton block h-11 w-full rounded-2xl" />
      <div className="app-card overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex h-12 items-center gap-3 border-t border-navy-100 px-4 first:border-t-0 dark:border-navy-750/70">
            <span className="skeleton h-4 w-5 rounded-md" />
            <span className="skeleton h-6 w-6 rounded-full" />
            <span className="skeleton h-4 flex-1 rounded-md" />
            <span className="skeleton h-4 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
