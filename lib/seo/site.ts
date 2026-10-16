/** Configure the production origin explicitly; never canonicalise to an untrusted Host header. */
const DEFAULT_ORIGIN = 'https://www.eviv.si';

export function siteUrl(raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL): string {
  try {
    const url = new URL(raw || DEFAULT_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid origin');
    return url.origin;
  } catch { return DEFAULT_ORIGIN; }
}
export function absoluteUrl(path: string): string { return new URL(path, `${siteUrl()}/`).href; }

/** Self-referential `alternates.canonical` block for a rendered page's own path. */
export function canonicalAlternates(path: string): { alternates: { canonical: string } } {
  return { alternates: { canonical: absoluteUrl(path) } };
}

/** Only well-formed public https(s) URLs are ever published as links, images or schema URLs. */
export function safeRemoteUrl(raw: string | null | undefined): string | undefined {
  try {
    const url = new URL(raw || '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

/** Safe inside a script element even when a provider supplied </script> or Unicode separators. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
