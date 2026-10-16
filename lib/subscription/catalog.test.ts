import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { catalogMatch } from './catalog';
import { GET } from '@/app/api/matches/route';
import type { Match } from '@/lib/types';

const matches = vi.hoisted(() => vi.fn());
vi.mock('@/lib/streamEngine', () => ({ getMatches: matches }));
const fixture = { id: 'espn-1', title: 'Home vs Away', status: 'live', timestamp: Date.now(), priority: 1, sources: [{ id: 'source', source: 'catalog', label: 'Server 1', url: 'https://media.example/4k.m3u8', quality: '4K' }], fallbackChannels: [{ name: 'Backup', url: 'https://media.example/master.m3u8' }] } as Match;
describe('public fixture catalog', () => {
  it('strips playback URLs without mutating the shared resolver object or losing availability', () => {
    const entry = catalogMatch(fixture);
    expect(entry).toMatchObject({ id: fixture.id, catalogStreamCount: 1, sources: [], fallbackChannels: [] });
    expect(JSON.stringify(entry)).not.toContain('https://media.example');
    expect(fixture.sources[0].url).toContain('https://media.example');
  });
  it('does not expose uncapped links through the public matches API', async () => {
    matches.mockResolvedValueOnce([fixture]);
    const response = await GET(new NextRequest('https://eviv.live/api/matches'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).matches[0]).toMatchObject({ catalogStreamCount: 1, sources: [], fallbackChannels: [] });
  });
});
