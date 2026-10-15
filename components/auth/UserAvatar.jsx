'use client';

import { useState } from 'react';
import { hueFor, initialsFor } from '@/lib/chat';
import { isImageAvatar, presetFor } from '@/lib/auth/avatar';
import VerifiedBadge from './VerifiedBadge';

/**
 * Fan avatar: uploaded picture, brand preset or initials disc, with the
 * verified seal pinned to the corner for registered fans.
 */
export default function UserAvatar({ name, avatarUrl, size = 32, verified = false, className = '', ring = true }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const preset = presetFor(avatarUrl);
  const showImage = isImageAvatar(avatarUrl) && failedSrc !== avatarUrl;
  const hue = hueFor(name || '?');
  const ringClass = ring ? 'ring-1 ring-white/15' : '';

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} data-user-avatar="">
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          className={`h-full w-full rounded-full object-cover ${ringClass}`}
          onError={() => setFailedSrc(avatarUrl)}
        />
      ) : preset ? (
        <span
          aria-hidden="true"
          className={`flex h-full w-full items-center justify-center rounded-full shadow-inner ${ringClass}`}
          style={{ background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), transparent 55%), linear-gradient(135deg, ${preset.from}, ${preset.to})`, fontSize: Math.round(size * 0.5) }}
        >
          {preset.emoji}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-full w-full items-center justify-center rounded-full font-black text-white ${ringClass}`}
          style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 42%), hsl(${(hue + 40) % 360} 70% 30%))`, fontSize: Math.max(9, Math.round(size * 0.36)) }}
        >
          {initialsFor(name || '?')}
        </span>
      )}
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-navy-950 p-[1px]">
          <VerifiedBadge size={Math.max(12, Math.round(size * 0.4))} />
        </span>
      )}
    </span>
  );
}
