import { describe, expect, it } from 'vitest';
import { requestOrigin, isSameOriginRequest } from './requestOrigin';
import { GET } from '@/app/auth/callback/route';
import { POST } from '@/app/auth/session/route';
import { NextRequest } from 'next/server';

const preview = '3000-preview.e2b.app';
describe('public reverse-proxy origins', () => {
  it('builds callback redirects on the public HTTPS preview, not localhost', async () => {
    const response = await GET(new NextRequest('http://0.0.0.0:3000/auth/callback', { headers: { 'x-forwarded-host': preview, 'x-forwarded-proto': 'https' } }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`https://${preview}/profile?auth=error&reason=missing`);
    expect(response.cookies.get('eviv-auth-verifier')?.secure).toBe(true);
  });

  it('accepts same-public-origin browser requests behind a proxy but still rejects cross-origin handoffs', async () => {
    const headers = { 'x-forwarded-host': preview, 'x-forwarded-proto': 'https', origin: `https://${preview}` };
    const missingSession = await POST(new NextRequest('http://0.0.0.0:3000/auth/session', { method: 'POST', headers }));
    expect(missingSession.status).toBe(401);
    const crossOrigin = await POST(new NextRequest('http://0.0.0.0:3000/auth/session', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' } }));
    expect(crossOrigin.status).toBe(403);
  });

  it('keeps valid ports, handles forwarded header lists, and rejects malformed hosts', () => {
    expect(requestOrigin(new Request('http://internal:3000', { headers: { host: 'localhost:4000' } }))).toBe('http://localhost:4000');
    expect(requestOrigin(new Request('http://internal:3000', { headers: { 'x-forwarded-host': `${preview}, internal`, 'x-forwarded-proto': 'https, http' } }))).toBe(`https://${preview}`);
    for (const host of ['evil.example/path', 'user@evil.example', 'evil.example?query=1', 'evil.example#hash', 'https://evil.example']) {
      expect(requestOrigin(new Request('http://internal:3000', { headers: { 'x-forwarded-host': host } }))).toBe('http://internal:3000');
    }
  });

  it('requires Origin for session handoffs and rejects cross-site Fetch Metadata', () => {
    expect(isSameOriginRequest(new Request('https://footy.example'), true)).toBe(false);
    expect(isSameOriginRequest(new Request('https://footy.example'))).toBe(true);
    expect(isSameOriginRequest(new Request('https://footy.example', { headers: { origin: 'https://footy.example', 'sec-fetch-site': 'cross-site' } }), true)).toBe(false);
  });
});
