'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { signInWithTokens } from '@/lib/auth';
import { AUTH_RETURN_MESSAGES, authReturnReason, isAuthHash, tokensFromHash } from '@/lib/auth/return';

/** Bridge both server code/token-hash callbacks and legacy implicit email links. */
export default function AuthReturnNotice({ authReturn, reason }) {
  const pending = useRef(null);
  const [notice, setNotice] = useState(() => authReturn === 'complete'
    ? { tone: 'pending', text: 'Completing your sign-in…' }
    : authReturn ? { tone: 'error', text: AUTH_RETURN_MESSAGES[authReturnReason(reason)] } : null);

  useEffect(() => {
    const hash = window.location.hash;
    const hasHash = isAuthHash(hash);
    if (!hasHash && authReturn !== 'complete' && !pending.current) return;

    // Scrub credentials before any fetch/render; never leave them in history.
    const clean = new URL(window.location.href);
    if (hasHash) clean.hash = '';
    for (const key of ['auth', 'reason', 'code', 'token_hash']) clean.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${clean.pathname}${clean.search}${clean.hash}`);

    // StrictMode runs effects twice. Share the one-time handoff request and
    // sign-in operation instead of consuming the cookie twice.
    pending.current ??= (async () => {
      try {
        let tokens;
        if (hasHash) {
          const params = new URLSearchParams(hash.slice(1));
          if (params.has('error') || params.has('error_code')) return { ok: false, error: AUTH_RETURN_MESSAGES.expired };
          tokens = tokensFromHash(hash);
        } else {
          const response = await fetch('/auth/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) return { ok: false, error: AUTH_RETURN_MESSAGES.expired };
          tokens = (await response.json()).tokens;
        }
        if (!tokens) return { ok: false, error: AUTH_RETURN_MESSAGES.missing };
        return await signInWithTokens(tokens);
      } catch {
        return { ok: false, error: AUTH_RETURN_MESSAGES.unavailable };
      }
    })();
    let disposed = false;
    pending.current.then((result) => {
      if (!disposed) setNotice(result.ok
        ? { tone: 'success', text: 'You’re signed in. Welcome to your fan profile!' }
        : { tone: 'error', text: `${result.error} Please sign in below or request a fresh confirmation email.` });
    });
    return () => { disposed = true; };
  }, [authReturn]);

  if (!notice) return null;
  const Icon = notice.tone === 'pending' ? Loader2 : notice.tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`glass-dark flex items-start gap-3 rounded-2xl p-4 text-sm font-semibold ${notice.tone === 'error' ? 'text-amber-200' : 'text-lime-200'}`} data-auth-return={notice.tone}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${notice.tone === 'pending' ? 'animate-spin' : ''}`} aria-hidden="true" />
      <p>{notice.text}</p>
    </div>
  );
}
