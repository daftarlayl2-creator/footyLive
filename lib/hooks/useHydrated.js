'use client';

import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * True after hydration, false during SSR and the hydration pass.
 *
 * `useSyncExternalStore` uses `getServerSnapshot` for the server render *and*
 * for the client's first hydration render, so anything gated behind this flag
 * paints identical HTML on both sides and only appears (or switches to local
 * formatting) on the immediate post-hydration render — never a mismatch.
 */
export default function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
