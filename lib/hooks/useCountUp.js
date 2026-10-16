'use client';

import { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animated numeric counter: eases from the previously displayed value to the
 * latest `target` over ~650ms with an ease-out curve. Reduced-motion users (or
 * non-numeric targets) get the final value on the next frame. Every state
 * update happens inside animation-frame callbacks — never synchronously in an
 * effect — so no render cascades.
 */
export default function useCountUp(target, durationMs = 650) {
  const numeric = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [display, setDisplay] = useState(numeric);
  const fromRef = useRef(numeric);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (REDUCED_MOTION || durationMs <= 0 || from === numeric) {
      if (from !== numeric) {
        frameRef.current = requestAnimationFrame(() => {
          fromRef.current = numeric;
          setDisplay(numeric);
        });
        return () => cancelAnimationFrame(frameRef.current);
      }
      return undefined;
    }
    const startedAt = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (numeric - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = numeric;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [numeric, durationMs]);

  return Math.round(display);
}
