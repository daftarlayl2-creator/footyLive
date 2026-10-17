/**
 * Typo-tolerant channel search for the IPTV catalogue.
 *
 * Matching is deliberately explainable (no fuzzy-score magic): names and
 * queries are accent-folded, then every query token must appear — as a
 * substring, or as a subsequence for length ≥ 3 (so "bein" finds
 * "beIN SPORTS" and "aljazera" almost-matches "Al Jazeera" via tokens).
 * Results rank exact > prefix > substring > subsequence, stable otherwise.
 */

export function foldText(value: string): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) {
      i += 1;
      if (i === needle.length) return true;
    }
  }
  return false;
}

/** 0 = no match; higher is better. */
export function channelSearchScore(name: string, query: string): number {
  const foldedName = foldText(name);
  const foldedQuery = foldText(query);
  if (!foldedQuery) return 1;
  if (!foldedName) return 0;
  if (foldedName === foldedQuery) return 100;
  if (foldedName.startsWith(foldedQuery)) return 80;
  if (foldedName.includes(foldedQuery)) return 60;

  const tokens = foldedQuery.split(' ').filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (foldedName.includes(token)) score += 30;
    else if (token.length >= 3 && isSubsequence(token, foldedName.replace(/ /g, ''))) score += 10;
    else return 0;
  }
  return score;
}

export function searchChannels<T extends { name: string }>(channels: T[], query: string): T[] {
  const q = String(query ?? '').trim();
  if (!q) return channels;
  return channels
    .map((channel) => ({ channel, score: channelSearchScore(channel.name, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.channel);
}
