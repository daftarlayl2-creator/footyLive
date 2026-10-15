'use client';

import { useCallback, useState } from 'react';
import { initialsForClub, resizedEspnImage } from '@/lib/clubs/images';

/**
 * Club crest with a graceful fallback chain: resized ESPN image → original
 * URL → initials disc. `size` is the rendered size in px (2× is requested for
 * retina screens). With `fill`, the crest sizes itself to its container
 * (`size` then only picks the image resolution). `bare` leaves sizing and the
 * fallback's look entirely to `className` / `fallbackClassName` (used by the
 * liquid-glass <CrestDrop>).
 */
export default function TeamLogo({
  src,
  name,
  size = 28,
  className = '',
  rounded = 'rounded-full',
  priority = false,
  fill = false,
  bare = false,
  fallbackClassName = '',
}) {
  const candidates = [];
  const resized = resizedEspnImage(src, size * 2);
  if (resized) candidates.push(resized);
  if (src && src !== resized) candidates.push(src);

  // Failures are tracked per source so a new `src` starts fresh.
  const [failure, setFailure] = useState({ src: null, count: 0 });
  const failedCount = failure.src === src ? failure.count : 0;
  const current = candidates[failedCount];

  const handleError = useCallback(() => setFailure({ src, count: failedCount + 1 }), [src, failedCount]);
  // A server-rendered image that failed before hydration never fires onError — detect it on mount.
  const imageRef = useCallback(
    (node) => {
      if (node && node.complete && node.naturalWidth === 0) handleError();
    },
    [handleError]
  );

  const dimension = fill || bare ? undefined : { width: size, height: size };

  if (!current) {
    return (
      <span
        aria-hidden="true"
        style={dimension}
        className={
          bare
            ? `inline-flex shrink-0 items-center justify-center font-black ${className} ${fallbackClassName}`
            : `inline-flex shrink-0 items-center justify-center bg-navy-100 font-black text-navy-700 ring-1 ring-navy-200 dark:bg-navy-950 dark:text-zinc-300 dark:ring-navy-750 ${fill ? 'h-full w-full' : ''} ${rounded} ${className} ${fallbackClassName}`
        }
      >
        <span style={{ fontSize: fill ? 28 : Math.max(8, Math.round(size * 0.34)) }}>{initialsForClub(name)}</span>
      </span>
    );
  }

  return (
    <img
      src={current}
      alt=""
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      ref={imageRef}
      onError={handleError}
      style={dimension}
      className={`shrink-0 object-contain ${fill ? 'h-full w-full' : ''} ${bare ? '' : rounded} ${className}`}
    />
  );
}
