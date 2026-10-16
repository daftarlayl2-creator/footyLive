'use client';

import { findCountry, flagCss } from '@/lib/geo/countries';

/**
 * Animated waving flag (pure CSS/SVG — no flag images fetched).
 *
 * The flag art comes from the stripe data in lib/geo/countries (painted as a
 * linear-gradient), the wave itself is the `flagWave` sway plus a `flagSheen`
 * highlight drifting across the fabric (see app/globals.css). Both stop under
 * prefers-reduced-motion. Unknown codes fall back to a Limon lime/burgundy
 * pennant so a stale stored code never renders a broken image.
 */
export default function WavingFlag({ code, size = 22, className = '', title }) {
  const country = findCountry(code);
  const width = Math.max(14, Math.min(96, Math.round(Number(size) || 22)));
  const label = title || (country ? `${country.name} flag` : 'Fan flag');

  return (
    <span
      className={`waving-flag ${className}`.trim()}
      style={{ '--flag-w': `${width}px`, '--flag-bg': country ? flagCss(country) : undefined }}
      role="img"
      aria-label={label}
      title={label}
      data-waving-flag={country ? country.code : 'XX'}
    >
      <span className="waving-flag__fabric">
        <span className="waving-flag__sheen" aria-hidden="true" />
        {country?.emblem && (
          <span className="waving-flag__emblem" style={{ color: country.emblemColor }} aria-hidden="true">
            {country.emblem}
          </span>
        )}
      </span>
    </span>
  );
}
