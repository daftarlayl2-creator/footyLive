'use client';

import { useSyncExternalStore } from 'react';

/**
 * Hydration-safe localStorage state shared by every component (and tab).
 *
 * `useLocalValue(key)` returns the stored string (or `null`) — `null` during
 * SSR and the hydration pass, the real value right after — and re-renders on
 * writes from this tab (`writeLocal`) or other tabs (`storage` event).
 */

const LOCAL_EVENT = 'eviv:local-value';

export function readLocal(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  } catch {
    // Private mode / quota: subscribers still re-read (and get the old value).
  }
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { key } }));
}

function subscribe(callback) {
  window.addEventListener(LOCAL_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(LOCAL_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

const serverSnapshot = () => null;

export function useLocalValue(key) {
  return useSyncExternalStore(subscribe, () => readLocal(key), serverSnapshot);
}
