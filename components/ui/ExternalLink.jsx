'use client';

import { useState } from 'react';

/**
 * External links (provider docs, Wikipedia, YouTube, valuation sources) get a
 * safe fallback handler: only well-formed public https URLs become links, and a
 * click probes the destination first so dead hosts/APIs degrade to an inline
 * notice instead of a broken tab.
 */

/** Only well-formed public https URLs are ever published as outbound links. */
export function safeExternalUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** True when the destination answers (even a redirect); false on DNS/network failure. */
export async function probeExternal(url) {
  try {
    await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

export default function ExternalLink({
  href,
  children,
  className = '',
  fallbackLabel = 'Link temporarily unavailable',
  onFallback,
  ...rest
}) {
  const safe = safeExternalUrl(href);
  const [failed, setFailed] = useState(false);

  if (!safe) {
    return (
      <span className={className} title={fallbackLabel} data-external-link="invalid" {...rest}>
        {children}
      </span>
    );
  }
  if (failed) {
    return (
      <span className={className} title={fallbackLabel} data-external-link="unavailable" role="status">
        {fallbackLabel}
      </span>
    );
  }

  const handleClick = async (event) => {
    // Let modified clicks (new tab/window intents) through untouched.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (await probeExternal(safe)) return;
    event.preventDefault();
    setFailed(true);
    onFallback?.(safe);
  };

  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
      data-external-link="ok"
      {...rest}
    >
      {children}
    </a>
  );
}
