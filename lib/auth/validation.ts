/**
 * Input rules shared by the sign-up / profile forms and both auth backends.
 */

export const MIN_PASSWORD_LENGTH = 8;
/** GoTrue hashes passwords with bcrypt, which only reads the first 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 24;

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

export function validateEmail(email: unknown): string | null {
  const value = normalizeEmail(email);
  if (!value) return 'Enter your email address.';
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(password: unknown): string | null {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return 'Mix letters and at least one number.';
  return null;
}

/** Strips control characters and markup, collapses whitespace, trims to the max length. */
export function sanitizeDisplayName(name: unknown): string {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
}

export function validateDisplayName(name: unknown): string | null {
  const value = sanitizeDisplayName(name);
  if (value.length < MIN_DISPLAY_NAME_LENGTH) return `Use at least ${MIN_DISPLAY_NAME_LENGTH} characters.`;
  return null;
}
