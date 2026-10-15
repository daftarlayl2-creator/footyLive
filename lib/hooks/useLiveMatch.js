'use client';

import useSWR from 'swr';

const fetchMatch = async (url) => {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Live score temporarily unavailable');
  const data = await response.json();
  if (!data?.match) throw new Error('Match not found');
  return data;
};

/** Scoreboard and goal alerts share one polling request/cache per match. */
export default function useLiveMatch(matchId, initial) {
  const { data, mutate, isValidating } = useSWR(
    matchId ? `/api/match/${encodeURIComponent(matchId)}` : null,
    fetchMatch,
    {
      fallbackData: { match: initial },
      refreshInterval: (latest) => latest?.match?.status === 'finished' ? 0 : 20000,
      dedupingInterval: 5000,
      revalidateOnFocus: false,
      revalidateOnMount: false,
      shouldRetryOnError: false,
    }
  );
  return {
    data: { ...initial, ...data?.match },
    refresh: async () => {
      try { await mutate(); } catch { /* Keep the last good score; the next poll retries. */ }
    },
    loading: isValidating,
  };
}
