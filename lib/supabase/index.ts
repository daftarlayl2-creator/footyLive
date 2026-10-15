'use client';

/**
 * Supabase entry point for client components.
 *
 * `import { useSupabase } from '@/lib/supabase'` gives a component the shared
 * client plus the backend it talks to. Without credentials the client is backed
 * by the browser-local store (localStorage + cross-tab realtime), so chat and
 * predictions are fully interactive instead of silently dropping writes.
 */

import { useMemo } from 'react';
import {
  initSupabase,
  getSupabaseMode,
  isMockMode as getIsMockMode,
  type SupabaseClient,
  type SupabaseMode,
} from './client';

export type UseSupabaseResult = {
  /** Always non-null: the local store stands in when no credentials are set. */
  supabase: SupabaseClient;
  /** `remote` = shared Supabase project, `local` = this browser only. */
  mode: SupabaseMode;
  /** True when no Supabase project is configured (data stays in this browser). */
  isMockMode: boolean;
};

export function useSupabase(): UseSupabaseResult {
  return useMemo(
    () => ({ supabase: initSupabase(), mode: getSupabaseMode(), isMockMode: getIsMockMode() }),
    []
  );
}

export * from './client';
export * from './types';
