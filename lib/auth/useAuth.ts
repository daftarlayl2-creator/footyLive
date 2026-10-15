'use client';

import { useSyncExternalStore } from 'react';
import { getAuthSnapshot, getServerAuthSnapshot, subscribeAuth } from './store';
import type { AuthSnapshot } from './types';

/**
 * Current fan auth state: `{ status: 'loading' | 'guest' | 'authenticated', user, provider }`.
 * `loading` only appears during the server render and hydration.
 */
export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
}
