import { useId } from 'react';
import { senderTheme } from '@/lib/inbox';

/**
 * The seal drawn in a message header — the visual proof of *who* is writing.
 *
 *   platform (إدارة الموقع) → a gold-on-burgundy regal crest with the lemon
 *                              mark, laurels and a slowly turning gold ring.
 *   admin        (الأدمين)   → a neon-lime broadcast transmitter: pulsing
 *                              signal arcs and a live bar, pure command-centre.
 *   support   (الدعم الفني)  → a calm sky-blue headset with a chat bubble and a
 *                              fast-response countdown ring.
 *
 * All three are self-contained SVG + CSS so they scale with the header size and
 * freeze under `prefers-reduced-motion` (see globals.css).
 */
export default function SenderSeal({ sender, size = 40, className = '', animated = true }) {
  const theme = senderTheme(sender);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const goldId = `seal-gold-${id}`;
  const limeId = `seal-lime-${id}`;
  const skyId = `seal-sky-${id}`;
  const box = Math.max(18, Math.min(96, Math.round(Number(size) || 40)));

  return (
    <span
      className={`sender-seal ${theme.sealClass} ${animated ? 'sender-seal--animated' : ''} ${className}`}
      style={{ width: box, height: box, '--seal-accent': theme.accent }}
      data-sender-seal={theme.id}
      role="img"
      aria-label={`${theme.nameEn} seal`}
    >
      <svg viewBox="0 0 48 48" width={box} height={box} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={goldId} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#FFE9A8" />
            <stop offset="0.45" stopColor="#F5C544" />
            <stop offset="1" stopColor="#A9761A" />
          </linearGradient>
          <linearGradient id={limeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E7FF8F" />
            <stop offset="0.5" stopColor="#CCFF00" />
            <stop offset="1" stopColor="#6FA300" />
          </linearGradient>
          <linearGradient id={skyId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#BAE6FD" />
            <stop offset="0.55" stopColor="#38BDF8" />
            <stop offset="1" stopColor="#0C6E9E" />
          </linearGradient>
        </defs>

        {theme.seal === 'crest' && (
          <g>
            <path d="M24 3l16 5.5v13.8C40 33.4 33 40.6 24 45 15 40.6 8 33.4 8 22.3V8.5z" fill={`url(#${goldId})`} stroke="#7A5310" strokeWidth="1" strokeLinejoin="round" />
            <path d="M24 6.6l12.7 4.4v11.3C36.7 31.2 31 37.1 24 40.9 17 37.1 11.3 31.2 11.3 22.3V11z" fill="#2A0813" opacity="0.92" />
            {/* lemon core */}
            <ellipse cx="24" cy="22" rx="7.4" ry="5.6" fill="#FFD34E" />
            <path d="M31 19.6q1.9-2.6 3.6-1.4-0.9 2.6-3.6 2.4z" fill="#CCFF00" />
            <path d="M17.4 22q6.6-4.2 13.2 0-6.6 4.2-13.2 0z" fill="#FFF3B0" opacity="0.5" />
            {/* laurels */}
            <path d="M14.6 30.6q3.4 3.4 9.4 4.2M33.4 30.6q-3.4 3.4-9.4 4.2" fill="none" stroke={`url(#${goldId})`} strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
            <path d="M15.4 27.4q2.6 2.6 6.4 3.4" fill="none" stroke={`url(#${goldId})`} strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
            <circle className="sender-seal__ring" cx="24" cy="24" r="20.6" fill="none" stroke="#F5C544" strokeWidth="0.7" strokeDasharray="3 5" opacity="0.55" />
          </g>
        )}

        {theme.seal === 'broadcast' && (
          <g>
            <circle cx="24" cy="24" r="20" fill="#0B1200" opacity="0.92" />
            <circle cx="24" cy="24" r="20" fill="none" stroke={`url(#${limeId})`} strokeWidth="1.4" />
            <g className="sender-seal__waves" fill="none" stroke="#CCFF00" strokeWidth="1.7" strokeLinecap="round">
              <path d="M17.4 30.6a9.4 9.4 0 0 1 13.2 0" opacity="0.9" />
              <path d="M13.6 26.8a14.6 14.6 0 0 1 20.8 0" opacity="0.6" />
              <path d="M10.4 23.4a19.4 19.4 0 0 1 27.2 0" opacity="0.32" />
            </g>
            <circle cx="24" cy="33" r="3.1" fill={`url(#${limeId})`} />
            <path d="M24 33V16" stroke="#CCFF00" strokeWidth="2.1" strokeLinecap="round" />
            <circle className="sender-seal__ping" cx="24" cy="16" r="2.4" fill="#CCFF00" />
            <rect x="17" y="7" width="14" height="3.4" rx="1.7" fill="#CCFF00" opacity="0.85" />
          </g>
        )}

        {theme.seal === 'headset' && (
          <g>
            <circle cx="24" cy="24" r="20" fill="#08202E" opacity="0.94" />
            <circle cx="24" cy="24" r="20" fill="none" stroke={`url(#${skyId})`} strokeWidth="1.3" />
            <path d="M14 25.5v-3.2a10 10 0 0 1 20 0v3.2" fill="none" stroke={`url(#${skyId})`} strokeWidth="2.4" strokeLinecap="round" />
            <rect x="11.6" y="24" width="5.6" height="9" rx="2.8" fill={`url(#${skyId})`} />
            <rect x="30.8" y="24" width="5.6" height="9" rx="2.8" fill={`url(#${skyId})`} />
            <path d="M33.6 33v1.4a3.4 3.4 0 0 1-3.4 3.4h-3.4" fill="none" stroke="#7DD3FC" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="23" cy="37.8" r="1.9" fill="#7DD3FC" />
            <circle className="sender-seal__pulse" cx="24" cy="24" r="17.4" fill="none" stroke="#38BDF8" strokeWidth="1.2" strokeDasharray="26 80" opacity="0.85" />
          </g>
        )}
      </svg>
    </span>
  );
}
