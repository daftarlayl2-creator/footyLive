/** Instant club page skeleton (shown while ESPN data loads). */
export default function ClubLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading club">
      <span className="skeleton block h-9 w-24 rounded-2xl" />
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-700 to-navy-950 p-5 sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <span className="h-28 w-28 animate-pulse rounded-[2rem] bg-white/15 sm:h-36 sm:w-36" />
          <div className="w-full max-w-sm space-y-3">
            <span className="mx-auto block h-5 w-32 animate-pulse rounded-full bg-white/15 sm:mx-0" />
            <span className="mx-auto block h-10 w-64 animate-pulse rounded-xl bg-white/20 sm:mx-0" />
            <span className="mx-auto block h-4 w-48 animate-pulse rounded bg-white/15 sm:mx-0" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="h-16 animate-pulse rounded-2xl bg-white/10" />
          ))}
        </div>
      </div>
      <div className="app-card space-y-3 p-5">
        <span className="skeleton block h-4 w-40 rounded-md" />
        <span className="skeleton block h-3 w-full rounded-md" />
        <span className="skeleton block h-3 w-[85%] rounded-md" />
      </div>
      <span className="skeleton block h-11 w-full rounded-2xl" />
    </div>
  );
}
