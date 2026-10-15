'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

const FORMATS = {
  date: { weekday: 'short', day: 'numeric', month: 'short' },
  time: { hour: '2-digit', minute: '2-digit' },
  datetime: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  long: { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
};

/**
 * Kick-off times in the visitor's own time zone. The server (and the
 * hydration pass) render a deterministic UTC string; right after hydration
 * the browser swaps in local time — no hydration mismatch.
 */
export default function LocalDateTime({ iso, variant = 'datetime', className }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  const options = FORMATS[variant] || FORMATS.datetime;
  const text = mounted
    ? date.toLocaleString([], options)
    : `${new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date)}${variant === 'date' ? '' : ' UTC'}`;
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
