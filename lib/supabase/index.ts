'use client';

/**
 * Supabase entry point for client components.
 *
 * `import { useSupabase } from '@/lib/supabase'` gives a component the shared
 * client plus a flag telling it whether real credentials are configured. Without
 * credentials the mock client from `./client` is returned, so chat/prediction UI
 * still renders (and simply skips writes) during development.
 */

import { useMemo } from 'react';
import { initSupabase, isMockMode as getIsMockMode, type SupabaseClient } from './client';

export type UseSupabaseResult = {
  /** Always non-null: a mock client stands in when no credentials are set. */
  supabase: SupabaseClient;
  /** True when the mock client is in use, i.e. writes should be skipped. */
  isMockMode: boolean;
};

export function useSupabase(): UseSupabaseResult {
  return useMemo(
    () => ({ supabase: initSupabase(), isMockMode: getIsMockMode() }),
    []
  );
}

export * from './client';
export * from './types';
