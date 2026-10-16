import { useId } from 'react';

/**
 * The Limon Live lockup: a lime "lemon" mark (with a burgundy leaf and the EVIV
 * coin at its heart), the LIMON wordmark and the animated on-air signal, drawn
 * as one scalable SVG.
 *
 * Brand colours: lime #CCFF00 on deep burgundy #2A0813. The wordmark inherits
 * `currentColor` (dark chrome keeps it white), while the mark stays lime in both
 * themes so the logo is identical in every surface.
 */
export default function BrandLogo({ className = 'h-auto w-28', title = 'Limon Live' }) {
  // Header and footer each render this SVG; scope <defs> so neither copy can
  // resolve `<use>`/gradients against the other one.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `limon-g-${id}`;
  const leafId = `limon-leaf-${id}`;
  const coinId = `limon-coin-${id}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" role="img" aria-label={title} color="#FFFFFF" className={className}>
      <title>{title}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9FF80" />
          <stop offset="0.5" stopColor="#CCFF00" />
          <stop offset="1" stopColor="#8FBF00" />
        </linearGradient>
        <linearGradient id={leafId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3D0B1D" />
          <stop offset="1" stopColor="#2A0813" />
        </linearGradient>
        <radialGradient id={coinId} cx="42%" cy="32%" r="70%">
          <stop offset="0" stopColor="#F6FFB8" />
          <stop offset="60%" stopColor="#CCFF00" />
          <stop offset="100%" stopColor="#9BCC00" />
        </radialGradient>
      </defs>

      {/* Lime lemon mark: a citrus silhouette with a deep-burgundy leaf. */}
      <g transform="translate(10 12)">
        <ellipse cx="52" cy="62" rx="42" ry="36" fill={`url(#${gradientId})`} />
        <path d="M52 26 L62 14 L52 26 Z" fill="#CCFF00" />
        <path d="M90 58 L104 62 L90 68 Z" fill="#CCFF00" />
        <path d="M14 58 L2 62 L14 68 Z" fill="#CCFF00" />
        <path d="M52 98 L52 112 L58 100 Z" fill="#CCFF00" opacity=".8" />
        {/* Leaf */}
        <path d="M60 26c12-14 26-16 34-15-1 10-8 22-22 25-6 1-11 0-15-3 0-3 1-5 3-7Z" fill={`url(#${leafId})`} />
        <path d="M64 30c8-6 18-9 26-9" stroke="#CCFF00" strokeWidth="1.6" fill="none" opacity=".7" />
        {/* Specular highlight */}
        <ellipse cx="34" cy="44" rx="16" ry="10" fill="#FFFFFF" opacity=".28" transform="rotate(-22 34 44)" />
        {/* EVIV coin embedded in the lemon: lime ring, burgundy core, engraved E. */}
        <circle cx="52" cy="64" r="23" fill="#2A0813" />
        <circle cx="52" cy="64" r="23" fill="none" stroke={`url(#${coinId})`} strokeWidth="3.4" />
        <circle cx="52" cy="64" r="18.5" fill="none" stroke="#CCFF00" strokeWidth="1" opacity=".45" />
        <g fill="none" stroke="#CCFF00" strokeWidth="4.2" strokeLinecap="square">
          <path d="M60 53 H44 V75 H60" />
          <path d="M44 64 H56" strokeWidth="3.6" />
        </g>
      </g>

      {/* LIMON wordmark */}
      <g transform="translate(150 44) skewX(-10)" fill="currentColor">
        {/* L */}
        <path d="M0 0 H10 V35 H32 V44 H0 Z" />
        {/* I */}
        <path d="M40 0 H50 V44 H40 Z" />
        {/* M */}
        <path d="M58 0 H68 L77 26 L86 0 H96 V44 H87 V17 L79.5 38 H74.5 L67 17 V44 H58 Z" />
        {/* O */}
        <path d="M112 0 H136 V44 H112 Z M122 9 H126 V35 H122 Z" fillRule="evenodd" />
        {/* N */}
        <path d="M146 0 H156 L170 26 V0 H180 V44 H170 L156 18 V44 H146 Z" />
      </g>

      {/* LIVE wordmark in lime */}
      <g transform="translate(154 98) skewX(-10)" fill="#CCFF00">
        <path d="M0 0 H3 V13 H11 V16 H0 Z" />
        <path d="M25 0 H28 V16 H25 Z" />
        <path d="M42 0 H45.2 L49.5 12.5 L53.8 0 H57 L51.2 16 H47.8 Z" />
        <path d="M71 0 H82 V3 H74 V6.5 H81 V9.5 H74 V13 H82 V16 H71 Z" />
      </g>

      {/* On-air signal: a pulsing lime dot with broadcast arcs. */}
      <g transform="translate(6 0)" fill="#CCFF00">
        <circle cx="262" cy="100" r="3.5" />
        <circle cx="262" cy="100" r="3.5" opacity=".6">
          <animate attributeName="r" values="3.5;7" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".6;0" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <path d="M269.78 92.22 A11 11 0 0 1 269.78 107.78 L268.01 106.01 A8.5 8.5 0 0 0 268.01 93.99 Z" />
        <path d="M254.22 92.22 A11 11 0 0 0 254.22 107.78 L255.99 106.01 A8.5 8.5 0 0 1 255.99 93.99 Z" />
        <path d="M274.73 87.27 A18 18 0 0 1 274.73 112.73 L272.96 110.96 A15.5 15.5 0 0 0 272.96 89.04 Z" opacity=".5" />
        <path d="M249.27 87.27 A18 18 0 0 0 249.27 112.73 L251.04 110.96 A15.5 15.5 0 0 1 251.04 89.04 Z" opacity=".5" />
      </g>
    </svg>
  );
}
