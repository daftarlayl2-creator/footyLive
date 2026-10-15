import { useId } from 'react';

/** The EVIV Live eagle, wordmark and on-air signal, scaled as one lockup. */
export default function BrandLogo({ className = 'h-auto w-28', title = 'EVIV Live' }) {
  // The header and footer each render this SVG. Scope <defs> so neither copy
  // can accidentally resolve its <use> or gradient against the other one.
  const id = useId();
  const gradientId = `eviv-g-${id}`;
  const wingId = `eviv-wing-${id}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" role="img" aria-label={title} color="#FFFFFF" className={className}>
      <title>{title}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E4FF66" />
          <stop offset="0.5" stopColor="#C6FF00" />
          <stop offset="1" stopColor="#9BCC00" />
        </linearGradient>
        <g id={wingId}>
          <path d="M54 52 L34 36 L6 18 L18 40 L2 48 L22 56 L10 74 L34 68 L26 86 L50 74 Z" fill={`url(#${gradientId})`} />
          <path d="M54 56 L38 44 L26 53 L40 60 L50 66 Z" fill="#18030A" opacity=".28" />
        </g>
      </defs>
      <g transform="translate(10 15)">
        <use href={`#${wingId}`} />
        <use href={`#${wingId}`} transform="translate(120 0) scale(-1 1)" />
        <path d="M60 24 L74 40 L70 58 L60 74 L50 58 L46 40 Z M52 42 L52 49 L59 46 Z M68 42 L61 46 L68 49 Z" fill={`url(#${gradientId})`} />
        <path d="M54 70 L60 92 L66 70 L60 76 Z" fill="#C6FF00" />
        <path d="M50 96 L60 118 L70 96 L60 102 Z" fill="#C6FF00" opacity=".75" />
      </g>
      <g transform="translate(154 38) skewX(-12)" fill="currentColor">
        <path d="M0 0 H30 V9 H9 V18 H26 V26 H9 V35 H30 V44 H0 Z" />
        <path d="M38 0 H49 L57 30 L65 0 H76 L62 44 H52 Z" />
        <path d="M84 0 H94 V44 H84 Z" />
        <path d="M102 0 H113 L121 30 L129 0 H140 L126 44 H116 Z" />
      </g>
      <g transform="translate(158 92) skewX(-12)" fill="#C6FF00">
        <path d="M0 0 H3 V13 H11 V16 H0 Z" />
        <path d="M25 0 H28 V16 H25 Z" />
        <path d="M42 0 H45.2 L49.5 12.5 L53.8 0 H57 L51.2 16 H47.8 Z" />
        <path d="M71 0 H82 V3 H74 V6.5 H81 V9.5 H74 V13 H82 V16 H71 Z" />
      </g>
      <g transform="translate(6 0)" fill="#C6FF00">
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
