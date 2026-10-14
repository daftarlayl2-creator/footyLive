/**
 * EVIV Live brand mark — a soaring eagle silhouette in Navy Blue & Lime Green.
 * Drawn as a solid, GitHub-style glyph: one filled silhouette path plus a
 * feather accent per wing, so it stays crisp from 20px (favicon) to 64px.
 */
export default function BrandLogo({ className = 'h-8 w-8', withPlate = false, title = 'EVIV Live' }) {
  const glyph = (
    <svg
      viewBox="0 0 96 96"
      className={withPlate ? 'h-[62%] w-[62%]' : className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="evivEagleBody" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#a2fa5f" />
          <stop offset="52%" stopColor="#32cd32" />
          <stop offset="100%" stopColor="#1c851f" />
        </linearGradient>
      </defs>

      {/* Silhouette: head → swept wings → tapered tail */}
      <path
        d="M48 11.5
           C51.2 11.5 53.7 13.4 54.5 16.3
           C60.9 16.7 66.8 18.3 72.2 20.9
           L92.5 30.1
           C84.4 34.3 74.2 36.2 63.2 35.6
           C61.5 39.8 57.5 42.9 52.3 43.9
           L48 63.5
           L43.7 43.9
           C38.5 42.9 34.5 39.8 32.8 35.6
           C21.8 36.2 11.6 34.3 3.5 30.1
           L23.8 20.9
           C29.2 18.3 35.1 16.7 41.5 16.3
           C42.3 13.4 44.8 11.5 48 11.5 Z"
        fill="url(#evivEagleBody)"
      />

      {/* Beak */}
      <path d="M45.4 16.9 L48 24.2 L50.6 16.9 Z" fill="#0b132b" opacity="0.85" />

      {/* Feather separation accents */}
      <path
        d="M42.5 22.6 C32 25 21.5 27.2 11.5 30.9"
        fill="none"
        stroke="#0b132b"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M53.5 22.6 C64 25 74.5 27.2 84.5 30.9"
        fill="none"
        stroke="#0b132b"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* Collar */}
      <path
        d="M41.6 32.4 C43.6 34.6 50.4 34.6 54.4 32.4"
        fill="none"
        stroke="#060e1e"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );

  if (!withPlate) return glyph;

  return (
    <span className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-navy-700 via-navy-850 to-navy-950 ring-1 ring-lime-500/40 shadow-[0_0_18px_-2px_rgba(50,205,50,0.45)]">
      {glyph}
    </span>
  );
}
