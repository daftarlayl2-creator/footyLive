import TeamLogo from '@/components/clubs/TeamLogo';
import { dropTint } from '@/lib/clubs/colors';

/** Largest rendered size (px) per token, used to request a sharp enough image. */
const SIZE_TOKENS = { xs: 26, sm: 34, md: 44, lg: 84, xl: 136 };

/**
 * Club crest inside a liquid-glass "water droplet" (see `.crest-drop` in
 * globals.css): a translucent bead with a frosted backdrop, radial caustic
 * glow, curved specular highlight, glint and layered shadows. Transparent
 * PNG crests float inside it; missing crests fall back to initials.
 *
 * - `size`: 'xs' | 'sm' | 'md' | 'lg' | 'xl' (responsive tokens) or pixels.
 * - `tint`: hex colour for the inner glow (e.g. the club's kit colour).
 * - `tone="dark"`: keep the dark glass look even in light theme (for drops
 *   that sit on always-dark surfaces such as the scoreboard).
 * - `label`: accessible name; without it the drop is decorative.
 *
 * Hook-free, so it renders in server and client components alike.
 */
export default function CrestDrop({ src, name, size = 'md', tint, tone, label, priority = false, className = '' }) {
  const token = typeof size === 'string' && SIZE_TOKENS[size] ? size : null;
  const px = token ? SIZE_TOKENS[token] : Math.max(16, Math.round(Number(size) || SIZE_TOKENS.md));

  const style = {};
  if (!token) style['--drop-size'] = `${px}px`;
  const glow = dropTint(tint);
  if (glow) style['--drop-tint'] = glow;

  return (
    <span
      className={`crest-drop${token ? ` crest-drop--${token}` : ''}${tone === 'dark' ? ' crest-drop--dark' : ''}${className ? ` ${className}` : ''}`}
      style={Object.keys(style).length ? style : undefined}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      data-crest-drop=""
    >
      <TeamLogo
        src={src}
        name={name}
        size={Math.round(px * 0.64)}
        bare
        priority={priority}
        className="crest-drop__img"
        fallbackClassName="crest-drop__initials"
      />
    </span>
  );
}
