import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/iptv/catalog', () => ({
  getIptvCatalog: vi.fn(async () => ({
    channels: [
      { id: 'iptv-1', name: 'Arryadia', logo: '', category: 'Sports', region: 'MA', quality: 'HD', url: 'https://secret.example/x.m3u8', playlist: 'ma.m3u' },
    ],
    categories: ['Sports'],
    regions: ['MA'],
    sources: [{ playlist: 'ma.m3u', ok: true, count: 1 }],
    generatedAt: 123,
    stale: false,
  })),
  toPublicChannel: (c: any) => ({ id: c.id, name: c.name, logo: c.logo || '', category: c.category, region: c.region, quality: c.quality || '', href: `/iptv/${c.id}` }),
}));

import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/iptv/catalog', () => {
  it('is honestly empty while Live TV is hidden (Phase 2 flag)', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.disabled).toBe(true);
    expect(body.channels).toEqual([]);
  });

  it('serves the public catalogue without raw stream URLs when enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    const res = await GET();
    const body = await res.json();
    expect(body.disabled).toBe(false);
    expect(body.channels).toHaveLength(1);
    expect(body.channels[0].href).toBe('/iptv/iptv-1');
    expect(JSON.stringify(body)).not.toContain('secret.example');
  });
});
