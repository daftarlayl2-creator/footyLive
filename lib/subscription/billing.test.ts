import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/subscription/route';
import { POST } from '@/app/api/subscription/checkout/route';
import { billingConfigured, createViewer, getRequestSubscription, loadViewerGrants, verifyViewer, VIEWER_COOKIE } from './server';

const matches = vi.hoisted(() => vi.fn());
vi.mock('@/lib/streamEngine', () => ({ getMatchDetails: matches }));
const origin = 'https://footy.example';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const request = (body: unknown, cookie?: string, headers: Record<string, string> = {}) => new NextRequest(`${origin}/api/subscription/checkout`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: `${VIEWER_COOKIE}=${cookie}` } : {}), ...headers }, body: JSON.stringify(body),
});
const receipt = () => ({ id: 'paid-1', planId: 'monthly', status: 'paid', currency: 'MAD', amountMinor: 4000, startsAt: Date.now() - 1000, expiresAt: Date.now() + 100_000 });
beforeEach(() => {
  vi.stubEnv('STREAM_SECRET', 'test-only-distinct-media-secret-at-least-32-chars');
  vi.stubEnv('SUBSCRIPTION_SECRET', 'test-only-subscription-secret-at-least-32-chars');
  vi.stubEnv('BILLING_API_URL', 'https://billing.example/v1');
  vi.stubEnv('BILLING_API_KEY', 'test-only-server-key');
  matches.mockReset().mockResolvedValue({ id: 'espn-1', status: 'live' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('server-verified billing and checkout', () => {
  it('issues an opaque signed viewer identity, rejecting tampering and missing secrets', () => {
    const viewer = createViewer();
    expect(verifyViewer(viewer.cookie)).toBe(viewer.id);
    expect(verifyViewer(`${viewer.cookie}x`)).toBeNull();
    expect(verifyViewer(`x${viewer.cookie.slice(1)}`)).toBeNull();
    expect(verifyViewer(viewer.cookie + '.extra')).toBeNull();
    vi.stubEnv('STREAM_SECRET', 'default_stream_hmac_secret_key_123_abc');
    expect(billingConfigured()).toBe(false);
    vi.stubEnv('STREAM_SECRET', 'test-only-distinct-media-secret-at-least-32-chars');
    vi.stubEnv('SUBSCRIPTION_SECRET', 'short');
    expect(billingConfigured()).toBe(false); expect(verifyViewer(viewer.cookie)).toBeNull();
  });
  it('establishes an HttpOnly same-site cookie before contacting a payment service', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await GET(new NextRequest(`${origin}/api/subscription`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    const cookie = response.cookies.get(VIEWER_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(verifyViewer(cookie.value)).toBeTruthy();
    expect((await response.json()).grants).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps checkout unavailable without configuration and does not mint VIP from a success query', async () => {
    vi.stubEnv('BILLING_API_URL', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await POST(request({ planId: 'monthly', amountMinor: 1, vip: true }));
    expect(response.status).toBe(503);
    expect((await GET(new NextRequest(`${origin}/api/subscription?checkout=success&vip=true`))).status).toBe(200);
    expect(await getRequestSubscription(new Request(`${origin}/?vip=true`))).toMatchObject({ grants: [], checkoutAvailable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses fixed server-side prices and idempotency, never a client-supplied amount or return URL', async () => {
    const viewer = createViewer();
    const fetcher = vi.fn(async () => json({ checkoutUrl: 'https://merchant.example/pay/settled' })); vi.stubGlobal('fetch', fetcher);
    const response = await POST(request({ planId: 'monthly', amountMinor: 1, currency: 'USD', successUrl: 'https://evil.example' }, viewer.cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkoutUrl: 'https://merchant.example/pay/settled' });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://billing.example/v1/checkout');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-only-server-key', 'Idempotency-Key': expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.parse(options.body as string)).toMatchObject({ customerId: viewer.id, planId: 'monthly', amountMinor: 4000, currency: 'MAD', durationDays: 30, successUrl: `${origin}/pricing?checkout=success` });
    expect(response.cookies.get(VIEWER_COOKIE)).toMatchObject({ value: viewer.cookie, httpOnly: true, maxAge: 400 * 24 * 60 * 60 });
  });
  it('validates the selected fixture and does not charge for missing or finished matches', async () => {
    const viewer = createViewer(); const fetcher = vi.fn(async () => json({ checkoutUrl: 'https://merchant.example/pay' })); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ planId: 'match' }, viewer.cookie))).status).toBe(400);
    matches.mockResolvedValueOnce(null);
    expect((await POST(request({ planId: 'match', matchId: 'espn-1' }, viewer.cookie))).status).toBe(400);
    matches.mockResolvedValueOnce({ status: 'finished' });
    expect((await POST(request({ planId: 'match', matchId: 'espn-1' }, viewer.cookie))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await POST(request({ planId: 'match', matchId: 'espn-1' }, viewer.cookie))).status).toBe(200);
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ planId: 'match', matchId: 'espn-1', amountMinor: 300 });
  });
  it('rejects CSRF, malformed requests and missing purchase cookies before creating checkout', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ planId: 'annual' }, undefined, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(request({ planId: 'invalid' }))).status).toBe(400);
    expect((await POST(request({ planId: 'annual' }))).status).toBe(409);
    const invalid = new NextRequest(`${origin}/api/subscription/checkout`, { method: 'POST', headers: { Origin: origin }, body: '{' });
    expect((await POST(invalid)).status).toBe(400);
    expect((await POST(request({ planId: 'annual', extra: 'a'.repeat(2100) }))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('verifies entitlements with the authenticated adapter and does not expose its key', async () => {
    const viewer = createViewer();
    vi.stubGlobal('fetch', vi.fn(async () => json({ grants: [receipt(), { ...receipt(), id: 'refunded', status: 'refunded' }] })));
    const response = await GET(new NextRequest(`${origin}/api/subscription`, { headers: { Cookie: `${VIEWER_COOKIE}=${viewer.cookie}` } }));
    const body = await response.text();
    expect(JSON.parse(body).grants).toHaveLength(1);
    expect(body).not.toContain('test-only-server-key'); expect(body).not.toContain('amountMinor');
    expect(await loadViewerGrants(viewer.id)).toHaveLength(1);
  });
  it('fails closed on payment service errors and unsafe checkout destinations', async () => {
    const viewer = createViewer();
    const fetcher = vi.fn(async () => json({ checkoutUrl: 'javascript:alert(1)' })); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ planId: 'annual' }, viewer.cookie))).status).toBe(503);
    fetcher.mockImplementation(async () => json({ error: 'outage' }, 503));
    expect(await getRequestSubscription(new Request(`${origin}/`, { headers: { Cookie: `${VIEWER_COOKIE}=${viewer.cookie}` } }))).toMatchObject({ grants: [], unavailable: true });
    expect((await GET(new NextRequest(`${origin}/api/subscription`, { headers: { Cookie: `${VIEWER_COOKIE}=${viewer.cookie}` } }))).status).toBe(503);
  });
});
