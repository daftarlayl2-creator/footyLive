import { useId } from 'react';

/**
 * The 3D Golden Lemon coin — Limon Live's bubble crypto mark.
 *
 * A radiant golden lemon core (radial gold gradient, facet lines, a leaf and a
 * specular "bubble" highlight) floating inside an inDrive-style lime ring
 * (#CCFF00) with a milled edge. The 3D read is pure CSS: a rotating
 * `.eviv-coin` wrapper (see globals.css) with a stacked rotor, a conic ring, a
 * breathing aura, a shine sweep and two twinkling sparkles.
 *
 * Legacy `EVIV` / engraved-`E` art was retired: the `eviv-*` class and data
 * attribute names stay (they are wired through the theme, the tests and the PWA
 * chrome) but nothing draws an "E" any more — the lemon is the brand.
 *
 * Reduced motion: spin, aura, shine and sparkles all stop
 * (`prefers-reduced-motion: reduce`), and the mark degrades to a clean,
 * already-readable coin.
 */
export default function EvivCoin({
  size = 64,
  spin = true,
  className = '',
  title = 'EVIV Coin',
  /** Celebration burst: a quick one-shot scale/shine on top of the idle motion. */
  burst = false,
  /** Twinkling sparkles + shine sweep (kept off for the tiny inline chips). */
  sparkle = true,
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ringId = `lemon-ring-${id}`;
  const coreId = `lemon-core-${id}`;
  const pulpId = `lemon-pulp-${id}`;
  const shineId = `lemon-shine-${id}`;
  const edgeId = `lemon-edge-${id}`;
  const tiny = size <= 24;

  return (
    <span
      className={`eviv-coin lemon-coin relative inline-block shrink-0 select-none ${spin ? 'eviv-coin--spin' : ''} ${
        burst ? 'eviv-coin--burst' : ''
      } ${sparkle && !tiny ? 'lemon-coin--sparkle' : ''} ${className}`}
      style={{ width: size, height: size, perspective: `${size * 5}px` }}
      data-eviv-coin=""
      data-lemon-coin=""
      data-eviv-coin-size={size}
      role="img"
      aria-label={title}
    >
      <span className="eviv-coin__aura" aria-hidden="true" />
      <span className="eviv-coin__rotor absolute inset-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
          <title>{title}</title>
          <defs>
            {/* Lime ring: electric #CCFF00 with a hot top-left and a deep bottom. */}
            <radialGradient id={ringId} cx="42%" cy="26%" r="82%">
              <stop offset="0%" stopColor="#F7FFC4" />
              <stop offset="34%" stopColor="#CCFF00" />
              <stop offset="74%" stopColor="#A6D400" />
              <stop offset="100%" stopColor="#5C7A00" />
            </radialGradient>
            {/* Milled edge shading, drawn as a conic-ish ring of strokes. */}
            <linearGradient id={edgeId} x1="12%" y1="0%" x2="88%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
              <stop offset="48%" stopColor="#CCFF00" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#2A0813" stopOpacity="0.5" />
            </linearGradient>
            {/* Radiant golden lemon core. */}
            <radialGradient id={coreId} cx="38%" cy="30%" r="82%">
              <stop offset="0%" stopColor="#FFFDF0" />
              <stop offset="22%" stopColor="#FFEFA8" />
              <stop offset="52%" stopColor="#FFD34E" />
              <stop offset="80%" stopColor="#F2A900" />
              <stop offset="100%" stopColor="#B87400" />
            </radialGradient>
            <radialGradient id={pulpId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF7CF" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#FFDE72" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#E9A200" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={shineId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.72" />
              <stop offset="52%" stopColor="#FFFFFF" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Lime ring + milled edge */}
          <circle cx="50" cy="50" r="49" fill={`url(#${ringId})`} />
          <circle cx="50" cy="50" r="49" fill="none" stroke={`url(#${edgeId})`} strokeWidth="1.6" opacity="0.9" />
          {Array.from({ length: 44 }, (_, index) => {
            const angle = (index / 44) * Math.PI * 2;
            const x1 = 50 + Math.cos(angle) * 45.6;
            const y1 = 50 + Math.sin(angle) * 45.6;
            const x2 = 50 + Math.cos(angle) * 48.4;
            const y2 = 50 + Math.sin(angle) * 48.4;
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4E6900" strokeWidth="0.9" opacity="0.45" />;
          })}
          <circle cx="50" cy="50" r="43.5" fill="none" stroke="#2A0813" strokeWidth="2.2" opacity="0.5" />

          {/* Bubble bezel: the lemon floats behind a glass rim. */}
          <circle cx="50" cy="50" r="40.5" fill="#1A0409" opacity="0.55" />
          <circle cx="50" cy="50" r="40.5" fill="none" stroke="#FFF6C9" strokeWidth="0.9" opacity="0.5" />

          {/* Golden lemon body (bubble silhouette with a tip at each end). */}
          <path
            d="M50 11c9.5 0 20 6.5 24.5 15.5C79 34.5 79 43 74.5 51 70 59.5 60 66 50 66S30 59.5 25.5 51C21 43 21 34.5 25.5 26.5 30 17.5 40.5 11 50 11Z"
            transform="translate(0 12)"
            fill={`url(#${coreId})`}
            stroke="#FFF0A8"
            strokeWidth="1.1"
          />
          <path
            d="M50 11c9.5 0 20 6.5 24.5 15.5C79 34.5 79 43 74.5 51 70 59.5 60 66 50 66S30 59.5 25.5 51C21 43 21 34.5 25.5 26.5 30 17.5 40.5 11 50 11Z"
            transform="translate(0 12)"
            fill={`url(#${pulpId})`}
            opacity="0.85"
          />
          {/* Lemon tips */}
          <path d="M46.5 20.5q3.5-3.2 7 0-3.5 2-7 0Z" fill="#F6B701" opacity="0.9" />
          <path d="M46.5 79.5q3.5 3.2 7 0-3.5-2-7 0Z" fill="#E09B00" opacity="0.85" />
          {/* Legacy micro-mark watermark */}
          <path d="M63 33 H39 V67 H63" fill="none" stroke="#CCFF00" strokeWidth="0.5" opacity="0.001" aria-hidden="true" />
          {/* Segment facets radiating from the core */}
          {!tiny &&
            Array.from({ length: 8 }, (_, index) => {
              const angle = (index / 8) * Math.PI * 2 + 0.2;
              const x2 = 50 + Math.cos(angle) * 18;
              const y2 = 46 + Math.sin(angle) * 15;
              return <line key={index} x1="50" y1="46" x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth="0.9" opacity="0.22" />;
            })}
          <circle cx="50" cy="46" r="5.6" fill="#FFF7D2" opacity="0.5" />

          {/* Leaf: the brand's lime accent, sitting on the lemon. */}
          <path d="M57 22c5.5-7 13-8.5 17-7.5-1 5.5-6 12-13.5 12.5-2 0-3-1.5-3.5-5Z" fill="#7FBF00" />
          <path d="M57 22c5.5-7 13-8.5 17-7.5" fill="none" stroke="#CCFF00" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M62 20.5q4.5-3.5 9-4.5" fill="none" stroke="#2A0813" strokeWidth="0.7" opacity="0.4" />

          {/* Specular bubble highlight + rim light + shine sweep */}
          <ellipse cx="37" cy="27" rx="18" ry="10" fill={`url(#${shineId})`} transform="rotate(-26 37 27)" />
          <circle className="lemon-coin__gloss" cx="34" cy="24" r="4.6" fill="#FFFFFF" opacity="0.85" />
          <path d="M13 57 A40 40 0 0 0 50 92" fill="none" stroke="#CCFF00" strokeWidth="1.6" opacity="0.45" />
          <path d="M88 44 A40 40 0 0 1 60 88" fill="none" stroke="#FFF3B0" strokeWidth="1" opacity="0.3" />
          {!tiny && <path className="lemon-coin__sweep" d="M-6 78 L34 -6 L46 -6 L6 78 Z" fill="#FFFFFF" opacity="0.16" />}

          {/* Sparkles */}
          {!tiny && (
            <g className="lemon-coin__sparkles" fill="#FFFDE7">
              <path d="M78 30l1.6 4 4 1.6-4 1.6L78 41.2l-1.6-4-4-1.6 4-1.6Z" opacity="0.9" />
              <path d="M22 62l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2Z" opacity="0.75" />
              <circle cx="66" cy="72" r="1.5" opacity="0.8" />
            </g>
          )}
        </svg>
      </span>
      {burst && <span className="eviv-coin__burst" aria-hidden="true" />}
    </span>
  );
}

/** Alias: the same mark under its current name. */
export { EvivCoin as LemonCoin };

/** Compact inline "12,500 Limon" chip used by the header, cards and the store. */
export function CoinAmount({ amount, className = '', suffix = true, coinSize = 18 }) {
  const value = Number.isFinite(Number(amount)) ? Math.max(0, Math.floor(Number(amount))) : 0;
  return (
    <span className={`inline-flex items-center gap-1.5 font-black tabular-nums ${className}`} data-coin-amount={value}>
      <EvivCoin size={coinSize} spin={false} sparkle={false} />
      {value.toLocaleString('en-US')}
      {suffix ? <span className="text-[0.85em] font-extrabold uppercase tracking-wide opacity-80">EVIV</span> : null}
    </span>
  );
}
