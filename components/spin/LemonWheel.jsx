'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SPIN_PRIZES, prizeIndex, targetRotation } from '@/lib/spin/prizes';

/**
 * The 3D Daily Lemon Wheel.
 *
 * A glossy conic wheel in CSS 3D (`rotateX` tilt + `rotateZ` spin, real
 * `perspective`, layered rim highlights and a lemon-coin hub). The server
 * decides the prize; this component only animates the rotation to the segment
 * the API returned (`targetRotation`), so the wheel can never land anywhere
 * the backend did not choose. `prefers-reduced-motion` skips the spin-up
 * animation and jumps straight to the winning segment.
 */

const SEGMENT_COLORS = [
  ['#2A0813', '#4A1024'], // deep burgundy
  ['#CCFF00', '#9FD400'], // electric lime
  ['#3D0B1D', '#5C1230'],
  ['#B4E600', '#7FA900'],
  ['#280713', '#4A1024'],
  ['#CCFF00', '#9FD400'],
  ['#3D0B1D', '#5C1230'],
  ['#A8D900', '#7FA900'],
];

function segmentGradient(count) {
  const step = 360 / count;
  const stops = SPIN_PRIZES.map((prize, index) => {
    const [from, to] = SEGMENT_COLORS[index % SEGMENT_COLORS.length];
    return `${from} ${index * step}deg, ${to} ${(index + 1) * step}deg`;
  });
  return `conic-gradient(from ${-step / 2}deg, ${stops.join(', ')})`;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LemonWheel({ onSpin, disabled = false, resultPrizeId = null, spinning = false }) {
  const [rotation, setRotation] = useState(0);
  const [glow, setGlow] = useState(false);
  const landedRef = useRef(null);

  // The server picked a prize: land the wheel on its segment.
  useEffect(() => {
    if (!resultPrizeId || landedRef.current === resultPrizeId) return;
    landedRef.current = resultPrizeId;
    const next = targetRotation(resultPrizeId, prefersReducedMotion() ? 0 : 6, rotation);
    setRotation(next);
    setGlow(true);
    const id = setTimeout(() => setGlow(false), 2600);
    return () => clearTimeout(id);
    // Intentionally keyed on the result only — re-renders must not re-spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultPrizeId]);

  const segment = 360 / SPIN_PRIZES.length;

  return (
    <div className="flex flex-col items-center gap-4" data-lemon-wheel="">
      {/* 3D stage */}
      <div className="relative" style={{ perspective: '1100px' }}>
        {/* Pointer (fixed at 12 o'clock) */}
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1">
          <div className="h-0 w-0 border-x-[11px] border-t-[18px] border-x-transparent border-t-[#CCFF00] drop-shadow-[0_2px_6px_rgba(204,255,0,0.55)]" />
        </div>

        <div
          role="img"
          aria-label="Daily Lemon Wheel"
          data-wheel-face=""
          data-wheel-rotation={Math.round(rotation)}
          className={`relative h-[270px] w-[270px] rounded-full border-[7px] border-[#2A0813] shadow-[0_28px_60px_-18px_rgba(204,255,0,0.35),inset_0_0_28px_rgba(0,0,0,0.55)] transition-transform ${spinning ? 'duration-[4200ms]' : 'duration-700'} ${glow ? 'shadow-[0_0_70px_rgba(204,255,0,0.55)]' : ''}`}
          style={{
            transform: `rotateX(16deg) rotateZ(${rotation}deg)`,
            transformStyle: 'preserve-3d',
            transitionTimingFunction: spinning ? 'cubic-bezier(0.12, 0.75, 0.12, 1)' : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            background: segmentGradient(SPIN_PRIZES.length),
          }}
        >
          {/* Segment labels (counter-rotated so each reads upright-ish) */}
          {SPIN_PRIZES.map((prize, index) => (
            <span
              key={prize.id}
              data-segment={prize.id}
              className="pointer-events-none absolute left-1/2 top-1/2 origin-top text-[10px] font-black uppercase tracking-wide"
              style={{
                transform: `rotate(${index * segment + 180}deg) translate(-50%, -108px) rotate(180deg)`,
                color: index % 2 === 0 ? '#F4FFDD' : '#2A0813',
                textShadow: index % 2 === 0 ? '0 1px 2px rgba(0,0,0,0.65)' : 'none',
                width: '84px',
                textAlign: 'center',
                marginLeft: '-42px',
              }}
            >
              {prize.label}
            </span>
          ))}

          {/* Glass sheen */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle at 32% 24%, rgba(255,255,255,0.38), transparent 42%), radial-gradient(circle at 70% 82%, rgba(204,255,0,0.22), transparent 46%)' }}
            aria-hidden="true"
          />

          {/* Lemon-coin hub */}
          <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#2A0813] bg-gradient-to-br from-[#CCFF00] via-[#B4E600] to-[#7FA900] shadow-[0_10px_26px_rgba(0,0,0,0.5)]" data-wheel-hub="">
            <span className="text-3xl font-black text-[#2A0813]">🍋</span>
          </div>
        </div>
      </div>

      {/* Spin button */}
      <button
        type="button"
        onClick={onSpin}
        disabled={disabled || spinning}
        data-spin-button=""
        className="lime-cta tactile inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Sparkles className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
        {spinning ? 'Spinning…' : disabled ? 'Come back tomorrow' : 'Spin the Lemon Wheel'}
      </button>
    </div>
  );
}
