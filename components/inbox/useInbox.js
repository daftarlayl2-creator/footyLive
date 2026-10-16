'use client';

/**
 * Client access to the message centre (/api/inbox).
 *
 * The inbox is server-owned (see lib/inbox/server.ts): this hook only reads and
 * acknowledges. It refreshes when something else on the page files a receipt
 * (the `limon:inbox-updated` event a Rewards Store redemption fires), on tab
 * focus and every 30 s, so a confirmation appears without a reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INBOX_UPDATED_EVENT } from '@/lib/inbox';

const ENDPOINT = '/api/inbox';
const REFRESH_MS = 30_000;

export default function useInbox({ auto = true } = {}) {
  const [state, setState] = useState({ messages: [], unread: 0, summary: null, loaded: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(null);

  const load = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const request = (async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error('Inbox unavailable');
        const data = await response.json();
        setState({
          messages: Array.isArray(data?.messages) ? data.messages : [],
          unread: Number(data?.unread) || 0,
          summary: data?.summary ?? null,
          loaded: true,
        });
        setError(null);
        return data;
      } catch {
        setError('Your inbox could not be reached. Try again in a moment.');
        return null;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = request;
    return request;
  }, []);

  /** One POST + the refreshed snapshot, so the badge never lags the action. */
  const act = useCallback(async (body) => {
    setBusy(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || 'That action could not be completed.');
        return { ok: false, payload };
      }
      setState({
        messages: Array.isArray(payload?.messages) ? payload.messages : [],
        unread: Number(payload?.unread) || 0,
        summary: payload?.summary ?? null,
        loaded: true,
      });
      setError(null);
      return { ok: true, payload };
    } catch {
      setError('Your inbox could not be reached. Try again in a moment.');
      return { ok: false, payload: null };
    } finally {
      setBusy(false);
    }
  }, []);

  const markRead = useCallback((ids) => act({ action: 'read', ids: Array.isArray(ids) ? ids : [ids] }), [act]);
  const markAllRead = useCallback(() => act({ action: 'read-all' }), [act]);
  const archive = useCallback((id, archived = true) => act({ action: archived ? 'archive' : 'restore', id }), [act]);
  const remove = useCallback((id) => act({ action: 'remove', id }), [act]);
  const askSupport = useCallback((subject, body) => act({ action: 'support', subject, body }), [act]);

  useEffect(() => {
    if (!auto) return undefined;
    let cancelled = false;
    void load();
    const onIncoming = () => {
      if (!cancelled) void load();
    };
    const onFocus = () => {
      if (!cancelled && !document.hidden) void load();
    };
    window.addEventListener(INBOX_UPDATED_EVENT, onIncoming);
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => {
      if (!cancelled && !document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(INBOX_UPDATED_EVENT, onIncoming);
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [auto, load]);

  return { ...state, error, busy, refresh: load, markRead, markAllRead, archive, remove, askSupport };
}
