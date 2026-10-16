'use client';
import { useSubscription } from './SubscriptionProvider';

/** Also removes the sticky dock itself, not just its advertisement iframe. */
export default function AdFreeBoundary({ children }) {
  const { access } = useSubscription();
  return access.adFree ? null : children;
}
