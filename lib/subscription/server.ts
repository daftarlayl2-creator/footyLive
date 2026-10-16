/** Server-only billing boundary. Never trust a localStorage flag or checkout return parameter. */
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { parseSafeUpstreamUrl } from '@/lib/hlsProxy';
import { loadCoinGrants } from '@/lib/coins/server';
import { loadAdminGrants } from '@/lib/admin/vip';
import { WALLET_COOKIE, verifyWalletViewer, walletCookieFromHeader } from '@/lib/coins/session';
import { getPlan, validateGrants, type PlanId, type SubscriptionGrant } from './plans';

export const VIEWER_COOKIE = 'eviv_billing_viewer';
export const VIEWER_COOKIE_AGE_S = 400 * 24 * 60 * 60;
const BILLING_TIMEOUT_MS = 8_000;

function config() {
  const url = parseSafeUpstreamUrl(process.env.BILLING_API_URL || '');
  const secret = process.env.SUBSCRIPTION_SECRET || '';
  const key = process.env.BILLING_API_KEY || '';
  const streamSecret = process.env.STREAM_SECRET || '';
  const unsafeStreamKey = !streamSecret || streamSecret.length < 32 || streamSecret === secret || ['default_stream_hmac_secret_key_123_abc', 'change_me_to_a_long_random_string'].includes(streamSecret);
  if (!url || url.protocol !== 'https:' || url.search || url.hash || !key || secret.length < 32 || unsafeStreamKey) return null;
  return { url: url.href.replace(/\/$/, ''), key, secret };
}
export function billingConfigured(): boolean { return Boolean(config()); }

function signViewer(id: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`eviv:billing:viewer:v1:${id}`).digest('hex');
}
export function createViewer(): { id: string; cookie: string } {
  const settings = config();
  if (!settings) throw new Error('Billing is not configured.');
  const id = crypto.randomUUID();
  return { id, cookie: `${id}.${signViewer(id, settings.secret)}` };
}
export function verifyViewer(value?: string): string | null {
  const settings = config();
  if (!settings || !value || value.length > 110) return null;
  const [id, signature, extra] = value.split('.');
  if (extra || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(id || '') || !/^[\da-f]{64}$/.test(signature || '')) return null;
  const expected = signViewer(id, settings.secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? id : null;
}

async function billingRequest(path: string, init?: RequestInit): Promise<any> {
  const settings = config();
  if (!settings) throw new Error('Checkout is not configured yet. No payment has been taken.');
  const response = await fetch(`${settings.url}${path}`, {
    ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(BILLING_TIMEOUT_MS),
    headers: { ...init?.headers, Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${settings.key}` },
  });
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('The payment service is temporarily unavailable. Please try again.'); }
  // A compromised/misconfigured adapter must not stream an unbounded response into memory.
  if (Number(response.headers.get('content-length')) > 65_536) { await response.body?.cancel(); throw new Error('Invalid billing response.'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty billing response.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) throw new Error('Invalid billing response.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** The adapter must derive grants from settled, webhook-verified payments, including refunds. */
export async function loadViewerGrants(viewer: string | null): Promise<SubscriptionGrant[]> {
  if (!viewer || !billingConfigured()) return [];
  return validateGrants(await billingRequest(`/entitlements/${encodeURIComponent(viewer)}`));
}

/**
 * Effective grants for one visitor: paid billing grants, the VIP passes this fan
 * bought with Limon Coins in the Rewards Store, and any tier an operator assigned
 * from /mounadel. All three are keyed to a signed server-side id (the billing
 * viewer for paid passes, the wallet viewer for coins and admin tiers), so they
 * are real entitlements — never a client flag anyone could set in Inspect Element.
 */
async function subscriptionForCookie(value?: string | null, coinValue?: string | null) {
  const viewer = verifyViewer(value ?? undefined);
  const coinViewer = verifyWalletViewer(coinValue ?? undefined);
  try {
    const [billing, coin, admin] = await Promise.all([
      loadViewerGrants(viewer),
      loadCoinGrants(coinViewer),
      loadAdminGrants(coinViewer),
    ]);
    return {
      grants: [...billing, ...coin, ...admin],
      checkoutAvailable: billingConfigured(),
      unavailable: false,
      coinGrants: coin.length,
      adminGrants: admin.length,
    };
  } catch {
    return { grants: [], checkoutAvailable: billingConfigured(), unavailable: true, coinGrants: 0, adminGrants: 0 };
  }
}
function cookieValue(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  return header.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}
/** Explicit request variant for route handlers (also works with standard Request objects). */
export function getRequestSubscription(request: Request) {
  const header = request.headers.get('cookie');
  return subscriptionForCookie(cookieValue(header, VIEWER_COOKIE) ?? undefined, walletCookieFromHeader(header) ?? undefined);
}
/** React request cache deduplicates layout + player checks, never across visitors. Fail closed. */
export const getServerSubscription = cache(async () => {
  const jar = await cookies();
  return subscriptionForCookie(jar.get(VIEWER_COOKIE)?.value, jar.get(WALLET_COOKIE)?.value);
});

export async function createCheckout(viewer: string, planId: PlanId, origin: string, matchId?: string): Promise<string> {
  const plan = getPlan(planId)!;
  const idempotencyKey = crypto.createHash('sha256').update(`${viewer}:${planId}:${matchId || ''}:${Math.floor(Date.now() / 300_000)}`).digest('hex');
  const result = await billingRequest('/checkout', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({
    customerId: viewer, planId: plan.id, amountMinor: plan.amountMinor, currency: 'MAD',
    durationDays: plan.days, ...(plan.scope === 'match' ? { matchId } : {}),
    successUrl: `${origin}/pricing?checkout=success`, cancelUrl: `${origin}/pricing?checkout=cancelled`,
  }) });
  const target = parseSafeUpstreamUrl(result?.checkoutUrl);
  if (!target || target.protocol !== 'https:') throw new Error('The payment service returned an invalid checkout link.');
  return target.href;
}
