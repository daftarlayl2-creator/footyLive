import { absoluteUrl, safeRemoteUrl } from './site';

/**
 * Schema.org builders shared by match and club pages.
 *
 * Every value is typed the way schema.org expects it — ListItem.position is a
 * Number, names are Text, `item`/`url`/`logo` are URLs — so Google's rich
 * results validator accepts the graphs. Only sourced facts are published.
 */

export interface Crumb {
  /** Human label as shown in the navigation. */
  name: string;
  /** Site path (e.g. `/standings`); the final crumb is the current page. */
  path: string;
}

/** BreadcrumbList mirroring the site navigation: Home → … → current page. */
export function breadcrumbSchema(trail: Crumb[]): Record<string, unknown> | null {
  const items = trail.filter((crumb) => crumb?.name && crumb?.path);
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: String(crumb.name),
      item: absoluteUrl(crumb.path),
    })),
  };
}

export interface TeamSchemaInput {
  name: string;
  /** ESPN team id — used for the stable `@id` when there is no canonical page URL yet. */
  id?: string | number | null;
  /** Canonical club page URL (`/club/{id}-{slug}`). */
  url?: string | null;
  logo?: string | null;
  description?: string | null;
  /** Home ground, only when the data provider actually reports one. */
  venue?: string | null;
  sport?: string;
}

/** SportsTeam graph for a club page (required: `name`). */
export function sportsTeamSchema(team: TeamSchemaInput): Record<string, unknown> | null {
  const name = String(team.name || '').trim();
  if (!name) return null;
  const url = team.url ? safeRemoteUrl(team.url) || (team.url.startsWith('/') ? absoluteUrl(team.url) : undefined) : undefined;
  const logo = safeRemoteUrl(team.logo);
  const id = url ? `${url}#team` : team.id ? absoluteUrl(`/club/${encodeURIComponent(String(team.id))}`) + '#team' : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    ...(id ? { '@id': id } : {}),
    name,
    sport: team.sport || 'Football',
    ...(url ? { url } : {}),
    ...(logo ? { logo } : {}),
    ...(team.description?.trim() ? { description: team.description.trim() } : {}),
    ...(team.venue?.trim() ? { location: { '@type': 'Place', name: team.venue.trim() } } : {}),
  };
}
