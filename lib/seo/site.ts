/** Configure the production origin explicitly; never canonicalise to an untrusted Host header. */
export function siteUrl(raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL): string {
  try {
    const url = new URL(raw || 'https://limonlive.app');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid origin');
    return url.origin;
  } catch { return 'https://limonlive.app'; }
}
export function absoluteUrl(path: string): string { return new URL(path, `${siteUrl()}/`).href; }
/** Safe inside a script element even when a provider supplied </script> or Unicode separators. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
