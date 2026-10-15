import { AUTH_VERIFIER_COOKIE } from './return';

/** Generate an RFC 7636 S256 challenge for Supabase's code-based email flow. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64url = (input: Uint8Array) => btoa(String.fromCharCode(...input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = base64url(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The callback needs this browser's verifier. It contains no session credentials. */
export function rememberVerifier(verifier: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_VERIFIER_COOKIE}=${verifier}; Path=/auth; Max-Age=3600; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
}
