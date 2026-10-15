import { describe, it, expect, vi } from 'vitest';
import { probeEmbedTarget, refusalPage, signStreamRedirect, verifyStreamRedirect } from './streamRedirect';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 9, 15, 12);
const TARGET = 'https://provider.example/embed/42?lang=en';

function paramsOf(link: string): URLSearchParams {
  return new URLSearchParams(link.slice(link.indexOf('?') + 1));
}

describe('signStreamRedirect / verifyStreamRedirect', () => {
  it('round-trips a provider URL while the link is valid', () => {
    const link = signStreamRedirect(TARGET, { now: NOW, secret: SECRET });
    expect(link.startsWith('/api/stream-redirect?u=')).toBe(true);
    expect(verifyStreamRedirect(paramsOf(link), { now: NOW + 1000, secret: SECRET })).toEqual({ ok: true, target: TARGET });
  });

  it('rejects expired links, bad signatures and missing params', () => {
    const link = signStreamRedirect(TARGET, { now: NOW, ttlMs: 1000, secret: SECRET });
    expect(verifyStreamRedirect(paramsOf(link), { now: NOW + 5000, secret: SECRET })).toMatchObject({ ok: false, status: 403, reason: 'expired' });
    expect(verifyStreamRedirect(paramsOf(link), { now: NOW, secret: 'other' })).toMatchObject({ ok: false, reason: 'signature' });

    const tampered = paramsOf(link);
    tampered.set('sig', 'deadbeef');
    expect(verifyStreamRedirect(tampered, { now: NOW, secret: SECRET })).toMatchObject({ ok: false, reason: 'signature' });
    expect(verifyStreamRedirect(new URLSearchParams(''), { now: NOW, secret: SECRET })).toMatchObject({ ok: false, status: 403, reason: 'missing' });
  });

  it('refuses non-http targets even with a valid signature', () => {
    const link = signStreamRedirect('javascript:alert(1)', { now: NOW, secret: SECRET });
    expect(verifyStreamRedirect(paramsOf(link), { now: NOW, secret: SECRET })).toMatchObject({ ok: false, status: 400, reason: 'scheme' });
  });
});

describe('probeEmbedTarget', () => {
  const response = (status: number) => new Response('<html></html>', { status });

  it('maps upstream statuses conservatively', async () => {
    for (const [status, health] of [[200, 'ok'], [404, 'offline'], [410, 'offline'], [403, 'unknown'], [503, 'unknown']] as const) {
      const fetchImpl = vi.fn(async () => response(status)) as unknown as typeof fetch;
      await expect(probeEmbedTarget(TARGET, { fetchImpl })).resolves.toEqual({ health, status });
    }
  });

  it('reports hosts that do not resolve as offline and other errors as unknown', async () => {
    const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    await expect(probeEmbedTarget(TARGET, { fetchImpl: (async () => { throw dns; }) as unknown as typeof fetch })).resolves.toEqual({ health: 'offline' });
    await expect(
      probeEmbedTarget(TARGET, { fetchImpl: (async () => { throw new DOMException('timeout', 'TimeoutError'); }) as unknown as typeof fetch })
    ).resolves.toEqual({ health: 'unknown' });
  });
});

describe('refusalPage', () => {
  it('renders an escaped, dark error page', () => {
    const html = refusalPage('Stream link has <expired>');
    expect(html).toContain('&#60;expired&#62;');
    expect(html).toContain('color-scheme');
    expect(html).toContain('Switching to the next server');
  });
});
