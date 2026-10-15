import Link from 'next/link';
import { clubHref } from '@/lib/clubs/links';

/**
 * Wraps a club name / crest in a link to its `/club/[id]` page. Falls back to
 * a plain element when the club cannot be identified. Server- and
 * client-component safe.
 */
export default function ClubLink({ team, className = '', children, title, prefetch, ...rest }) {
  const href = clubHref(team);
  if (!href) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      prefetch={prefetch}
      title={title ?? (team?.name ? `${team.name} — club profile` : undefined)}
      className={className}
      {...rest}
    >
      {children}
    </Link>
  );
}
