'use client';

import { useId } from 'react';

const ROSETTE =
  'M12 1.6 L14.26 3.55 L17.2 2.99 L18.19 5.81 L21.01 6.8 L20.45 9.74 L22.4 12 L20.45 14.26 L21.01 17.2 L18.19 18.19 L17.2 21.01 L14.26 20.45 L12 22.4 L9.74 20.45 L6.8 21.01 L5.81 18.19 L2.99 17.2 L3.55 14.26 L1.6 12 L3.55 9.74 L2.99 6.8 L5.81 5.81 L6.8 2.99 L9.74 3.55 Z';

/** Limon brand colours. */
export const BADGE_LIME = '#CCFF00';
export const BADGE_BURGUNDY = '#2A0813';

/**
 * Limon "verified fan" seal: a Deep Burgundy rosette with a Lime keyline, inner
 * ring and check. The scalloped rosette turns slowly (`subtle-spin 12s linear
 * infinite`) behind the upright check while a soft lime halo breathes; both
 * stop under prefers-reduced-motion.
 *
 * The seal sits in a fixed-size, non-shrinking inline-flex box (`--vb-size`),
 * so it stays a perfect circle next to a truncated username, inside flex/grid
 * rows and on avatar frames — no stretching, no baseline jump, and the glow is
 * painted inside its own stacking context. Shown next to registered fans on
 * profiles, in the header and in chat.
 */
export default function VerifiedBadge({ size = 16, className = '', title = 'Verified fan' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fill = `vb-fill-${id}`;
  const sheen = `vb-sheen-${id}`;
  const requested = Number(size);
  const px = Number.isFinite(requested) ? Math.max(8, Math.min(96, Math.round(requested || 16))) : 16;
  return (
    <span
      role="img"
      aria-label={title}
      className={`verified-badge ${className}`.trim()}
      style={{ '--vb-size': `${px}px` }}
      data-verified-badge=""
    >
      <span className="verified-badge__glow" aria-hidden="true" />
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        aria-hidden="true"
        focusable="false"
        className="verified-badge__seal"
      >
        <title>{title}</title>
        <defs>
          <linearGradient id={fill} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="#5C1531" />
            <stop offset="0.55" stopColor={BADGE_BURGUNDY} />
            <stop offset="1" stopColor="#18030A" />
          </linearGradient>
          <radialGradient id={sheen} cx="0.34" cy="0.24" r="0.62">
            <stop offset="0" stopColor={BADGE_LIME} stopOpacity="0.32" />
            <stop offset="1" stopColor={BADGE_LIME} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="verified-badge__rosette">
          <path d={ROSETTE} fill={`url(#${fill})`} stroke={BADGE_LIME} strokeWidth="1.15" strokeLinejoin="round" />
        </g>
        <circle cx="12" cy="12" r="7.35" fill="none" stroke={BADGE_LIME} strokeOpacity="0.55" strokeWidth="0.8" />
        <circle cx="12" cy="12" r="9.2" fill={`url(#${sheen})`} />
        <path d="M7.7 12.35l2.85 2.85 5.75-6.05" fill="none" stroke={BADGE_LIME} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
