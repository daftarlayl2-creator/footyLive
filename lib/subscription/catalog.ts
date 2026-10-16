import type { Match } from '@/lib/types';

/** Public fixtures/RSC props carry availability counts, never uncapped media URLs. */
export function catalogMatch(match: Match): Match {
  return { ...match, catalogStreamCount: match.sources?.length || 0, sources: [], fallbackChannels: [] };
}
