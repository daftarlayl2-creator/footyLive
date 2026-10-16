import { cache } from 'react';
import { getMatchDetails } from '@/lib/streamEngine';

/** One provider read for metadata, schema and the match page during each server request. */
export const loadSeoMatch = cache(async (id: string) => getMatchDetails(id).catch(() => getMatchDetails(id)).catch(() => null));
