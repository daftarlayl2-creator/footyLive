'use client';

import { useId } from 'react';

const ROSETTE =
  'M12 1.6 L14.26 3.55 L17.2 2.99 L18.19 5.81 L21.01 6.8 L20.45 9.74 L22.4 12 L20.45 14.26 L21.01 17.2 L18.19 18.19 L17.2 21.01 L14.26 20.45 L12 22.4 L9.74 20.45 L6.8 21.01 L5.81 18.19 L2.99 17.2 L3.55 14.26 L1.6 12 L3.55 9.74 L2.99 6.8 L5.81 5.81 L6.8 2.99 L9.74 3.55 Z';

/**
 * EVIV "verified fan" seal: a glossy blue rosette with a white check, an
 * electric-lime inner ring and a burgundy keyline (brand colours). Shown next
 * to registered fans on profiles, in the header and in chat/comments.
 */
export default function VerifiedBadge({ size = 16, className = '', title = 'Verified fan' }) {
  const id = useId().replace(/:/g, '');
  const fill = `vb-fill-${id}`;
  const gloss = `vb-gloss-${id}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={`inline-block shrink-0 align-[-0.15em] drop-shadow-[0_1px_2px_rgba(29,99,240,0.55)] ${className}`}
      data-verified-badge=""
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={fill} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#6FD3FF" />
          <stop offset="0.5" stopColor="#1D9BF0" />
          <stop offset="1" stopColor="#1A4FD6" />
        </linearGradient>
        <radialGradient id={gloss} cx="0.35" cy="0.25" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={ROSETTE} fill={`url(#${fill})`} stroke="#3D0B1D" strokeOpacity="0.55" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="7.35" fill="none" stroke="#C6FF00" strokeOpacity="0.75" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="9.4" fill={`url(#${gloss})`} />
      <path d="M7.7 12.35l2.85 2.85 5.75-6.05" fill="none" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
