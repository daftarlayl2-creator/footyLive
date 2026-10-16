'use client';

/**
 * Client access to the message centre (/api/inbox).
 *
 * The inbox is server-owned (see lib/inbox/server.ts): this hook reads,
 * acknowledges — and *remembers*. Read/archive/dismiss decisions are mirrored
 * into a per-viewer localStorage ledger (`limon:inbox:ledger:v1:<viewer>`) the
 * moment they succeed, so the unread badge can never resurface on refresh:
 *
 *  1. Every successful `markRead` / `markAllRead` / archive / remove writes the
 *     ledger immediately and fires `limon:inbox-updated`, so the header tray and
 *     the /inbox page stay in sync without a reload.
 *  2. On every load, messages the ledger already judged are pinned to that state
 *     client-side (a cold server cache re-delivering an old welcome note as
 *     "unread" cannot reopen the badge), and the drift is healed back to the
 *     server with a quiet POST so both sides agree again.
 *  3. The `storage` event keeps other tabs of the same viewer in sync too.
 *
 * It refreshes when something else on the page files a receipt (the
 * `limon:inbox-updated` event a Rewards Store redemption fires), on tab focus
 * and every 30 s, so a confirmation appears without a reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INBOX_UPDATED_EVENT, notifyInboxUpdated } from '@/lib/inbox';

const ENDPOINT = '/api/inbox';
const REFRESH_MS = 30_000;
const LEDGER_PREFIX = 'limon:inbox:ledger:v1:';
/** Bounded: receipts live ~14 months, the ledger keeps the newest few hundred. */
const LEDGER_MAX_ENTRIES = 400;

const emptyLedger = () => ({ v: 1, read: {}, archived: {}, removed: {} });

function ledgerKey(userId) {
  return LEDGER_PREFIX + (userId || 'anonymous');
}

/** Newest-wins map trim so one long-lived viewer cannot grow the entry forever. */
function trimLedger(ledger) {
  const keep = (map, floor) => {
    const next = {};
    for (const [id, at] of Object.entries(map)) {
      if (at >= floor) next[id] = at;
    }
    return next;
  };
  const stamps = [...Object.values(ledger.read), ...Object.values(ledger.archived), ...Object.values(ledger.removed)].sort((a, b) => b - a);
  if (stamps.length <= LEDGER_MAX_ENTRIES) return ledger;
  const floor = stamps[LEDGER_MAX_ENTRIES - 1];
  return { v: 1, read: keep(ledger.read, floor), archived: keep(ledger.archived, floor), removed: keep(ledger.removed, floor) };
}

function readLedger(userId) {
  if (typeof window === 'undefined' || !userId) return emptyLedger();
  try {
    const raw = window.localStorage.getItem(ledgerKey(userId));
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyLedger();
    return {
      v: 1,
      read: parsed.read && typeof parsed.read === 'object' ? parsed.read : {},
      archived: parsed.archived && typeof parsed.archived === 'object' ? parsed.archived : {},
      removed: parsed.removed && typeof parsed.removed === 'object' ? parsed.removed : {},
    };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(userId, ledger) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(ledgerKey(userId), JSON.stringify(trimLedger(ledger)));
  } catch {
    /* private mode / quota — the server copy remains the source of truth */
  }
}

/**
 * Applies the ledger to a server snapshot. Returns the pinned messages plus any
 * drift (server says unread/archived/present where the ledger decided otherwise
 * — the signature of a cold cache re-delivering old mail) so it can be healed.
 */
function applyLedger(messages, ledger) {
  const drift = { read: [], archive: [], remove: [] };
  const merged = [];
  for (const message of messages) {
    if (ledger.removed[message.id]) {
      drift.remove.push(message.id);
      continue;
    }
    let next = message;
    const readAt = ledger.read[message.id];
    if (readAt && !message.read) {
      drift.read.push(message.id);
      next = { ...next, read: true, readAt };
    }
    if (ledger.archived[message.id] != null && !message.archived) {
      drift.archive.push(message.id);
      next = { ...next, archived: true };
    }
    merged.push(next);
  }
  return { merged, drift };
}

const countUnread = (messages) => messages.reduce((total, message) => total + (message.read || message.archived ? 0 : 1), 0);

export default function useInbox({ auto = true } = {}) {
  const [state, setState] = useState({ messages: [], unread: 0, summary: null, userId: null, loaded: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef(null);
  const userIdRef = useRef(null);

  const load = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const request = (async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!response.ok) throw new Error('Inbox unavailable');
        const data = await response.json();
        const userId = typeof data?.userId === 'string' ? data.userId : userIdRef.current;
        userIdRef.current = userId;
        const ledger = readLedger(userId);
        const { merged, drift } = applyLedger(Array.isArray(data?.messages) ? data.messages : [], ledger);
        const summary = data?.summary ?? null;
        setState({
          messages: merged,
          unread: countUnread(merged),
          // The server summary still counts drifted rows; restate the headline
          // number from the pinned view so the badge matches what is on screen.
          summary: summary ? { ...summary, unread: countUnread(merged) } : null,
          userId,
          loaded: true,
        });
        setError(null);
        // Quiet self-healing: a cache reset on the server side must not reopen
        // badges this viewer already cleared. One POST per drifted action.
        if (userId && drift.read.length) {
          void fetch(ENDPOINT, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'read', ids: drift.read.slice(0, 50) }),
          }).catch(() => undefined);
        }
        if (userId) {
          for (const id of drift.archive.slice(0, 10)) {
            void fetch(ENDPOINT, {
              method: 'POST',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'archive', id }),
            }).catch(() => undefined);
          }
          for (const id of drift.remove.slice(0, 10)) {
            void fetch(ENDPOINT, {
              method: 'POST',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'remove', id }),
            }).catch(() => undefined);
          }
        }
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
      const userId = userIdRef.current;
      const action = typeof body?.action === 'string' ? body.action : '';
      const now = Date.now();
      if (userId) {
        // Persist the decision *before* the badge can be redrawn from a stale
        // snapshot: this ledger entry is what survives refreshes and restarts.
        const ledger = readLedger(userId);
        const ids = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : [];
        if (action === 'read' || action === 'read-all') {
          const targets = action === 'read-all'
            ? (Array.isArray(payload?.messages) ? payload.messages : []).map((message) => message.id)
            : ids;
          for (const id of targets) ledger.read[id] = ledger.read[id] || now;
        } else if (action === 'archive') {
          for (const id of ids) {
            ledger.archived[id] = now;
            ledger.read[id] = ledger.read[id] || now;
          }
        } else if (action === 'restore') {
          for (const id of ids) delete ledger.archived[id];
        } else if (action === 'remove') {
          for (const id of ids) {
            ledger.removed[id] = now;
            ledger.read[id] = ledger.read[id] || now;
          }
        }
        writeLedger(userId, ledger);
      }
      setState({
        messages: Array.isArray(payload?.messages) ? payload.messages : [],
        unread: Number(payload?.unread) || 0,
        summary: payload?.summary ?? null,
        userId,
        loaded: true,
      });
      setError(null);
      // Fan out instantly: the other mounted inbox (header tray ↔ /inbox page,
      // the wallet chip) pulls the fresh snapshot without waiting for its timer.
      if (action && action !== 'support') notifyInboxUpdated({ action });
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
    const onStorage = (event) => {
      // Another tab of the same viewer updated the ledger — pull and re-pin.
      if (!cancelled && event.key && event.key.startsWith(LEDGER_PREFIX)) void load();
    };
    window.addEventListener(INBOX_UPDATED_EVENT, onIncoming);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    const timer = setInterval(() => {
      if (!cancelled && !document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(INBOX_UPDATED_EVENT, onIncoming);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      clearInterval(timer);
    };
  }, [auto, load]);

  return { ...state, error, busy, refresh: load, markRead, markAllRead, archive, remove, askSupport };
}
