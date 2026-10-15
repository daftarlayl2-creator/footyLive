/**
 * Password hashing for device-local accounts: PBKDF2-SHA256 through Web
 * Crypto with a random 16-byte salt, compared in constant time. Passwords are
 * never stored or transmitted in clear (Supabase accounts are hashed by
 * Supabase Auth instead).
 */

export interface PasswordHash {
  algorithm: 'PBKDF2-SHA256';
  iterations: number;
  /** base64 */
  salt: string;
  /** base64, 32 bytes */
  hash: string;
}

export const DEFAULT_PBKDF2_ITERATIONS = 150_000;

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('Secure sign-in needs a secure (https) connection in a modern browser.');
  return api;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Constant-time comparison (no early exit on the first differing byte). */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const api = subtle();
  const key = await api.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await api.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  { iterations = DEFAULT_PBKDF2_ITERATIONS, salt }: { iterations?: number; salt?: Uint8Array } = {}
): Promise<PasswordHash> {
  const saltBytes = salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, saltBytes, iterations);
  return { algorithm: 'PBKDF2-SHA256', iterations, salt: toBase64(saltBytes), hash: toBase64(hash) };
}

export async function verifyPassword(password: string, record: PasswordHash | null | undefined): Promise<boolean> {
  if (!record || record.algorithm !== 'PBKDF2-SHA256' || !record.salt || !record.hash) return false;
  try {
    const expected = fromBase64(record.hash);
    const actual = await derive(password, fromBase64(record.salt), record.iterations);
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}
