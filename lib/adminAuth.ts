import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'eviv_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.STREAM_SECRET ||
    'default_stream_hmac_secret_key_123_abc'
  );
}

function getExpectedCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || 'mounadel',
    password: process.env.ADMIN_PASSWORD || 'Riihabtii95@',
  };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateAdminCredentials(username: unknown, password: unknown): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  const expected = getExpectedCredentials();
  const userOk = safeEqual(username, expected.username);
  const passOk = safeEqual(password, expected.password);
  return userOk && passOk;
}

export function createAdminSessionToken(now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  const payload = `admin:${expiresAt}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${expiresAt}.${sig}`;
}

export function verifyAdminSessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiresRaw = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(`admin:${expiresAt}`)
    .digest('hex');

  return safeEqual(sig, expectedSig);
}
