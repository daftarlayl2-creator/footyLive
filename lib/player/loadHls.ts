/**
 * Shared, memoised hls.js chunk for every player on the page (the match
 * player and up to four multistream tiles download it once, on first use).
 * A failed download is not cached, so the next attempt retries the network.
 */

type HlsConstructor = typeof import('hls.js').default;

let hlsModule: Promise<HlsConstructor> | null = null;

export function loadHls(): Promise<HlsConstructor> {
  hlsModule ??= import('hls.js')
    .then((mod) => mod.default)
    .catch((err) => {
      hlsModule = null;
      throw err;
    });
  return hlsModule;
}
