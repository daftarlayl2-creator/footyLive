import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/site';

/**
 * Public football pages (match centres, live scores, tables, news) are open to
 * every crawler — including AI search bots. Staff, account, dev-hub and API
 * surfaces stay protected and non-indexable.
 */
const PROTECTED = ['/api/', '/auth/', '/staff', '/mounadel', '/api-hub', '/multistream', '/profile', '/inbox'];

/** AI/search crawlers explicitly welcomed on the public score & news pages. */
export const AI_CRAWLERS = ['ChatGPT-User', 'OAI-SearchBot', 'Googlebot', 'Google-Extended', 'PerplexityBot'] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PROTECTED },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: PROTECTED })),
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
