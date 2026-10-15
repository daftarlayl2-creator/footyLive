/**
 * ESPN serves 500×500 crests; its image combiner returns a resized copy, which
 * keeps a 20-row table light on mobile data. Non-ESPN URLs pass through.
 */
export function resizedEspnImage(url: string | null | undefined, size: number): string | null {
  if (!url) return null;
  const match = /^https?:\/\/a\.espncdn\.com(\/i\/[^?#]+\.(?:png|jpe?g|gif))$/i.exec(String(url));
  if (!match) return String(url);
  const px = Math.max(16, Math.round(size));
  // Crests are 500px at source: at that size the original is as good (and shares the cache).
  if (px >= 500) return String(url);
  return `https://a.espncdn.com/combiner/i?img=${match[1]}&w=${px}&h=${px}`;
}

export function initialsForClub(name: string | null | undefined): string {
  const words = String(name ?? '')
    .replace(/\b(FC|CF|AC|SC|AFC|CD|UD|SD|SS|AS)\b/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
