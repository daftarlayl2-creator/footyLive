/**
 * Signed redirect links for embedded (iframe) provider players.
 *
 * `/api/stream-redirect?u=<base64url>&expires=<ms>&sig=<hmac>` 302-redirects
 * to the provider page only while the HMAC signature is valid, so the route
 * cannot be abused as an open redirect. The same validation backs the
 * `?check=1` health probe the player uses to fail over from dead provider
 * links quickly (see `lib/player/embed.ts`).
 *
 * Server-only (Node `crypto`).
 */

import crypto from 'crypto';
import { classifyEmbedStatus, type EmbedHealth } from './player/embed';

export const STREAM_REDIRECT_PATH = '/api/stream-redirect';
/** Signed embed links stay valid for 4 hours. */
export const STREAM_REDIRECT_TTL_MS = 4 * 60 * 60 * 1000;

const DEFAULT_SECRET = process.env.STREAM_SECRET || 'default_stream_hmac_secret_key_123_abc';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function hmac(secret: string, encoded: string, expires: string | number): string {
  return crypto.createHmac('sha256', secret).update(`${encoded}:${expires}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export interface SignOptions {
  now?: number;
  ttlMs?: number;
  secret?: string;
}

/** Relative signed redirect link for a provider page URL. */
export function signStreamRedirect(originalUrl: string, options: SignOptions = {}): string {
  const { now = Date.now(), ttlMs = STREAM_REDIRECT_TTL_MS, secret = DEFAULT_SECRET } = options;
  const encoded = Buffer.from(originalUrl).toString('base64url');
  const expires = now + ttlMs;
  return `${STREAM_REDIRECT_PATH}?u=${encoded}&expires=${expires}&sig=${hmac(secret, encoded, expires)}`;
}

export type RedirectRejection = 'missing' | 'expired' | 'signature' | 'scheme' | 'encoding';

export type RedirectVerification =
  | { ok: true; target: string }
  | { ok: false; status: 400 | 403; reason: RedirectRejection; error: string };

const REJECTION_COPY: Record<RedirectRejection, { status: 400 | 403; error: string }> = {
  missing: { status: 403, error: 'Forbidden' },
  expired: { status: 403, error: 'Stream link has expired' },
  signature: { status: 403, error: 'Invalid signature' },
  scheme: { status: 400, error: 'Invalid URL scheme' },
  encoding: { status: 400, error: 'Invalid encoding' },
};

function reject(reason: RedirectRejection): RedirectVerification {
  return { ok: false, reason, ...REJECTION_COPY[reason] };
}

/** Validates `u` / `expires` / `sig` and decodes the provider URL. */
export function verifyStreamRedirect(
  params: URLSearchParams,
  options: { now?: number; secret?: string } = {}
): RedirectVerification {
  const { now = Date.now(), secret = DEFAULT_SECRET } = options;
  const u = params.get('u');
  const expires = params.get('expires');
  const sig = params.get('sig');
  if (!u || !expires || !sig) return reject('missing');

  const expiresAt = Number.parseInt(expires, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return reject('expired');
  if (!safeEqual(sig, hmac(secret, u, expires))) return reject('signature');

  let target: string;
  try {
    target = Buffer.from(u, 'base64url').toString('utf-8');
  } catch {
    return reject('encoding');
  }
  if (!/^https?:\/\//i.test(target)) return reject('scheme');
  try {
    new URL(target);
  } catch {
    return reject('encoding');
  }
  return { ok: true, target };
}

export interface EmbedProbeResult {
  health: EmbedHealth;
  /** Upstream HTTP status, when one was received. */
  status?: number;
}

/**
 * Server-side reachability check for a provider page. Conservative: only a
 * definitive "gone" (404/410, or a host that does not resolve) reports
 * `offline`; blocks, bot walls, timeouts and 5xx report `unknown` so a
 * working player is never skipped because our server was refused.
 */
export async function probeEmbedTarget(
  target: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<EmbedProbeResult> {
  const { fetchImpl = fetch, timeoutMs = 6000 } = options;
  try {
    const response = await fetchImpl(target, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    // Only the status matters; do not download the page.
    response.body?.cancel().catch(() => {});
    return { health: classifyEmbedStatus(response.status), status: response.status };
  } catch (error) {
    const code = (error as { cause?: { code?: string } } | null)?.cause?.code;
    return { health: code === 'ENOTFOUND' ? 'offline' : 'unknown' };
  }
}

/** Small dark page shown inside the player frame when a link is refused. */
export function refusalPage(message: string): string {
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>Stream link unavailable</title></head><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0b0105;color:#e4e4e7;font:600 14px/1.5 Inter,system-ui,sans-serif;text-align:center"><p>${safe}<br><span style="color:#c6ff00">Switching to the next server…</span></p></body></html>`;
}
