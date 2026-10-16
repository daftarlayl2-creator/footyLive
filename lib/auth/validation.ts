/**
 * Input rules shared by the sign-up / profile forms and both auth backends.
 */
import { ageFromBirthdate, normalizeCountryCode } from '@/lib/geo/countries';

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

/* ------------------------------------------------------------------------ */
/*  Fan identity: birthdate (age) + country                                  */
/* ------------------------------------------------------------------------ */

/** Oldest / youngest a fan profile may claim (football starts young). */
export const MIN_FAN_AGE = 5;
export const MAX_FAN_AGE = 120;

/**
 * Returns the ISO `YYYY-MM-DD` date, `null` to clear the field, or `undefined`
 * when the value is unusable (callers reject it with validateBirthdate).
 */
export function sanitizeBirthdate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(trimmed)) return undefined;
  return ageFromBirthdate(trimmed) === null ? undefined : trimmed;
}

export function validateBirthdate(value: unknown): string | null {
  const clean = sanitizeBirthdate(value);
  if (clean === null) return null; // clearing is always allowed
  if (clean === undefined) return 'Pick a real birth date (YYYY-MM-DD).';
  const age = ageFromBirthdate(clean);
  if (age === null || age < MIN_FAN_AGE) return `Fans must be at least ${MIN_FAN_AGE} years old.`;
  if (age > MAX_FAN_AGE) return 'That birth date is out of range.';
  return null;
}

/**
 * Returns the canonical country code, `null` to clear, or `undefined` when it
 * is not one of the selectable countries.
 */
export function sanitizeCountryCode(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const code = normalizeCountryCode(value);
  return code ?? undefined;
}
