'use client';

/**
 * Client access to the authoritative EVIV Coin wallet (/api/wallet).
 *
 * The balance always comes from the server. A locally cached number is used
 * only for the first paint, and it is never written back — the server decides
 * every credit, so editing localStorage (or Inspect Element) cannot mint coins.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COIN_STORAGE_KEY } from '@/lib/coins';

const ENDPOINT = '/api/wallet';

export const WALLET_UPDATED_EVENT = 'limon:wallet-updated';

export function readCachedBalance() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(COIN_STORAGE_KEY);
    if (!raw) return 0;
    const value = JSON.parse(raw);
    const candidate = typeof value === 'number' ? value : value?.balance;
    return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : 0;
  } catch {
    return 0;
  }
}

/** Display-only mirror of the last server-confirmed balance. */
export function cacheBalance(balance) {
  if (typeof window === 'undefined' || !Number.isFinite(balance)) return;
  try {
    window.localStorage.setItem(COIN_STORAGE_KEY, JSON.stringify({ balance: Math.max(0, Math.floor(balance)), verified: true }));
  } catch { /* private mode: ignore */ }
}

export function notifyWalletUpdated(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WALLET_UPDATED_EVENT, { detail }));
}

/**
 * Reads and mutates the server wallet. `settle(matchIds)` asks the backend to
 * pay out finished, correct predictions; `redeem(rewardId)` spends coins.
 */
export default function useWallet({ settleMatchIds = null, autoSettle = true } = {}) {
  const [state, setState] = useState({ balance: readCachedBalance(), awards: [], redemptions: [], vipActive: false, laidOut: false, loaded: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastCredit, setLastCredit] = useState(null);
  /** Matches already sent for settlement in this session (bounded re-checks). */
  const settled = useRef(new Set());
  const key = useMemo(() => (settleMatchIds || []).filter(Boolean).join(','), [settleMatchIds]);

  const apply = useCallback((payload) => {
    if (!payload || typeof payload.balance !== 'number') return null;
    setState({
      balance: Math.max(0, Math.floor(payload.balance)),
      awards: Array.isArray(payload.awards) ? payload.awards : [],
      redemptions: Array.isArray(payload.redemptions) ? payload.redemptions : [],
      reward: payload.reward,
      vipReward: payload.vipReward,
      vipActive: Boolean(payload.vipActive),
      vipExpiresAt: payload.vipExpiresAt ?? null,
      loaded: true,
    });
    cacheBalance(payload.balance);
    return payload;
  }, []);

  const request = useCallback(async (body) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, payload };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!response.ok) return null;
      return apply(await response.json());
    } catch {
      return null;
    }
  }, [apply]);

  const settle = useCallback(async (matchIds) => {
    const ids = (matchIds || []).filter((id) => typeof id === 'string' && id && !settled.current.has(id));
    if (!ids.length) return null;
    for (const id of ids) settled.current.add(id);
    setBusy(true);
    try {
      const { payload } = await request({ action: 'settle', matchIds: ids });
      const applied = apply(payload);
      const credited = Number(payload?.credited) || 0;
      if (credited > 0) {
        setLastCredit({ coins: credited, at: Date.now() });
        notifyWalletUpdated({ credited });
      }
      return applied;
    } catch {
      setError('Wallet sync unavailable');
      return null;
    } finally {
      setBusy(false);
    }
  }, [apply, request]);

  const redeem = useCallback(async (rewardId) => {
    setBusy(true);
    setError(null);
    try {
      const { ok, payload } = await request({ action: 'redeem', reward: rewardId });
      const applied = apply(payload);
      if (!ok) {
        setError(payload?.error || 'This reward could not be redeemed.');
        return { ok: false, payload };
      }
      notifyWalletUpdated({ redeemed: rewardId });
      return { ok: true, payload: applied };
    } catch {
      setError('Rewards store is temporarily unavailable.');
      return { ok: false, payload: null };
    } finally {
      setBusy(false);
    }
  }, [apply, request]);

  // First load, then settle any finished predictions this fan still has open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || !autoSettle) return;
      const pending = (settleMatchIds || []).filter((id) => id && !settled.current.has(id));
      if (pending.length) await settle(pending);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSettle, key]);

  // Another tab / the predictor may have changed the wallet.
  useEffect(() => {
    const onChange = () => { refresh(); };
    window.addEventListener(WALLET_UPDATED_EVENT, onChange);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, onChange);
  }, [refresh]);

  return { ...state, busy, error, lastCredit, refresh, settle, redeem };
}
