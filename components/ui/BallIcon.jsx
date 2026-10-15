/** Small football glyph for goal lists (inherits `currentColor`). */
export default function BallIcon({ className = 'h-3.5 w-3.5', title }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 7.6l3.4 2.45-1.3 4h-4.2l-1.3-4z" fill="currentColor" stroke="none" />
      <path d="M12 7.6V2.9M15.4 10.05l4.45-1.45M14.1 14.05l2.75 3.8M9.9 14.05l-2.75 3.8M8.6 10.05L4.15 8.6" />
    </svg>
  );
}
