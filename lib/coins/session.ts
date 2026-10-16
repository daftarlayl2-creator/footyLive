/**
 * Server-issued fan identity for the coin wallet and predictions.
 *
 * The wallet balance, the votes and the awards all live on the server, keyed by
 * a signed viewer id this server mints. A client cannot invent or edit the id
 * (the HMAC signature is checked in constant time), so "Inspect Element" edits
 * to a displayed balance never change what the backend believes.
 */
import crypto from 'node:crypto';

export const WALLET_COOKIE = 'limon_wallet_viewer';
/** 400 days — the maximum Chrome accepts for a first-party cookie. */
export const WALLET_COOKIE_AGE_S = 400 * 24 * 60 * 60;
export const WALLET_COOKIE_MAX_LENGTH = 110;

const FALLBACK_SECRET = 'default_stream_hmac_secret_key_123_abc';

export function walletSecret(): string {
  const configured = process.env.SUBSCRIPTION_SECRET || process.env.STREAM_SECRET || '';
  return configured.length >= 32 ? configured : FALLBACK_SECRET;
}

function sign(id: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`limon:wallet:viewer:v1:${id}`).digest('hex');
}

const isUuid = (value: string) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(value);
const isSignature = (value: string) => /^[\da-f]{64}$/.test(value);

/** A fresh viewer id plus the cookie value that carries it. */
export function createWalletViewer(secret: string = walletSecret()): { id: string; cookie: string } {
  const id = crypto.randomUUID();
  return { id, cookie: `${id}.${sign(id, secret)}` };
}

/** Verified viewer id, or null when the cookie is missing, malformed or forged. */
export function verifyWalletViewer(value?: string | null, secret: string = walletSecret()): string | null {
  if (!value || typeof value !== 'string' || value.length > WALLET_COOKIE_MAX_LENGTH) return null;
  const [id, signature, extra] = value.split('.');
  if (extra !== undefined || !id || !signature) return null;
  if (!isUuid(id) || !isSignature(signature)) return null;
  const expected = sign(id, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

/** Reads the wallet cookie out of a raw Cookie header. */
export function walletCookieFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const entry of header.split(';')) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(`${WALLET_COOKIE}=`)) return trimmed.slice(WALLET_COOKIE.length + 1) || null;
  }
  return null;
}

/** Cookie attributes shared by every response that mints/refreshes the viewer. */
export function walletCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WALLET_COOKIE_AGE_S,
  };
}
