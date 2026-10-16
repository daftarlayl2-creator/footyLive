import { useId } from 'react';

/**
 * The animated 3D EVIV Coin.
 *
 * Lime (#CCFF00) ring around a deep-burgundy (#2A0813) core with an engraved
 * "E" and a glowing aura. The 3D look is CSS only: a rotating `.eviv-coin`
 * wrapper (see globals.css) with stacked face/rim layers, a conic-gradient ring
 * and a slow aura pulse. The spin and pulse stop under
 * `prefers-reduced-motion: reduce`, and the whole mark degrades to a plain
 * engraved coin when the animation is disabled.
 */
export default function EvivCoin({
  size = 64,
  spin = true,
  className = '',
  title = 'EVIV Coin',
  /** Celebration burst: a quick one-shot scale/shine on top of the idle motion. */
  burst = false,
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const coreId = `eviv-coin-core-${id}`;
  const ringId = `eviv-coin-ring-${id}`;
  const shineId = `eviv-coin-shine-${id}`;

  return (
    <span
      className={`eviv-coin relative inline-block shrink-0 select-none ${spin ? 'eviv-coin--spin' : ''} ${
        burst ? 'eviv-coin--burst' : ''
      } ${className}`}
      style={{ width: size, height: size, perspective: `${size * 5}px` }}
      data-eviv-coin=""
      data-eviv-coin-size={size}
      role="img"
      aria-label={title}
    >
      <span className="eviv-coin__aura" aria-hidden="true" />
      <span className="eviv-coin__rotor absolute inset-0">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <title>{title}</title>
          <defs>
            <radialGradient id={ringId} cx="50%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#F3FFA6" />
              <stop offset="42%" stopColor="#CCFF00" />
              <stop offset="100%" stopColor="#8FBF00" />
            </radialGradient>
            <linearGradient id={coreId} x1="18%" y1="10%" x2="88%" y2="96%">
              <stop offset="0%" stopColor="#4A0F22" />
              <stop offset="46%" stopColor="#2A0813" />
              <stop offset="100%" stopColor="#160308" />
            </linearGradient>
            <linearGradient id={shineId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Lime ring / milled edge */}
          <circle cx="50" cy="50" r="48" fill={`url(#${ringId})`} />
          <circle cx="50" cy="50" r="48" fill="none" stroke="#7FA800" strokeWidth="0.8" opacity="0.7" />
          <circle cx="50" cy="50" r="43" fill="none" stroke="#2A0813" strokeWidth="2.6" opacity="0.55" />

          {/* Deep-burgundy core */}
          <circle cx="50" cy="50" r="39.5" fill={`url(#${coreId})`} />
          <circle cx="50" cy="50" r="39.5" fill="none" stroke="#CCFF00" strokeWidth="1.2" opacity="0.55" />
          <circle cx="50" cy="50" r="35" fill="none" stroke="#CCFF00" strokeWidth="0.7" opacity="0.3" />

          {/* Engraved E */}
          <g fill="none" stroke="#CCFF00" strokeWidth="6.5" strokeLinecap="square" opacity="0.96">
            <path d="M63 33 H39 V67 H63" />
            <path d="M39 50 H58" strokeWidth="5.5" />
          </g>
          <g fill="#2A0813" stroke="none" opacity="0.5" transform="translate(0.9 1.1)">
            <path d="M63 33 H39 V67 H63 V61.5 H45.5 V52.5 H58 V47 H45.5 V38.5 H63 Z" />
          </g>

          {/* Specular highlight + rim light */}
          <ellipse cx="38" cy="30" rx="19" ry="11" fill={`url(#${shineId})`} transform="rotate(-24 38 30)" />
          <path d="M12 55 A40 40 0 0 0 50 92" fill="none" stroke="#CCFF00" strokeWidth="1.4" opacity="0.4" />
        </svg>
      </span>
      {burst && <span className="eviv-coin__burst" aria-hidden="true" />}
    </span>
  );
}

/** Compact inline "12,500 EVIV" chip used by the header, cards and the store. */
export function CoinAmount({ amount, className = '', suffix = true }) {
  const value = Number.isFinite(Number(amount)) ? Math.max(0, Math.floor(Number(amount))) : 0;
  return (
    <span className={`inline-flex items-center gap-1.5 font-black tabular-nums ${className}`} data-coin-amount={value}>
      <EvivCoin size={18} spin={false} />
      {value.toLocaleString('en-US')}
      {suffix ? <span className="text-[0.85em] font-extrabold uppercase tracking-wide opacity-80">EVIV</span> : null}
    </span>
  );
}
