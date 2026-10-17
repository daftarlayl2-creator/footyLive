/**
 * The Limon Live lockup: the brand icon (`/logo-icon.svg`, 36px) followed by
 * the "limonlive" wordmark in Cairo (600) — "limon" in chalk #F4F6EE,
 * "live" in brand lime #C1F11D. The Cairo family is provided by the
 * `--font-wordmark` theme token (loaded via the global stylesheet).
 */
export default function BrandLogo({ className = '', title = 'Limon Live' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/logo-icon.svg" alt="Limon Live" className="h-9 w-9 shrink-0" />
      <span aria-hidden="true" className="font-wordmark text-[22px] font-semibold leading-none tracking-tight">
        <span className="text-[#F4F6EE]">limon</span>
        <span className="text-[#C1F11D]">live</span>
      </span>
      <span className="sr-only">{title}</span>
    </span>
  );
}
