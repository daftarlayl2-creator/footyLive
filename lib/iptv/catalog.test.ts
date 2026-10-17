import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async () => null,
    set: async () => {},
    swr: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  }),
}));
vi.mock('../logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import {
  getIptvCatalog,
  getIptvChannelById,
  isApprovedPlaylistUrl,
  resetIptvCatalogMemory,
  resolvePlaylistSources,
  toPublicChannel,
} from './catalog';

const MA_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="2M.ma@SD" tvg-logo="https://example.com/2m.png",2M',
  'https://cdn.example.com/2m/index.m3u8',
  '#EXTINF:-1 tvg-id="Arryadia.ma@SD" group-title="Sports",Arryadia',
  '#EXTVLCOPT:http-referrer=https://www.example.ma/',
  'https://cdn.example.com/arryadia/index.m3u8',
  // Malformed / unsafe entries must be skipped, never crash the catalogue.
  '#EXTINF:-1,Broken Entry',
  'rtsp://unsafe.example.com/stream',
  '#EXTINF:-1 tvg-id="2M.ma@SD",2M duplicate',
  'https://cdn.example.com/2m/index.m3u8',
  'not-a-url line',
].join('\n');

function stubFetch(routes: Record<string, () => Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [needle, make] of Object.entries(routes)) {
      if (String(url).includes(needle)) return make();
    }
    return new Response('not found', { status: 404 });
  }));
}

beforeEach(() => {
  resetIptvCatalogMemory();
  vi.stubEnv('IPTV_COUNTRIES', 'ma');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('playlist URL allowlist (SSRF guard)', () => {
  it('only approves the owner repository over HTTPS', () => {
    expect(isApprovedPlaylistUrl('https://raw.githubusercontent.com/daftarlayl2-creator/iptv/master/streams/ma.m3u')).toBe(true);
    expect(isApprovedPlaylistUrl('https://daftarlayl2-creator.github.io/iptv/index.m3u')).toBe(true);
    expect(isApprovedPlaylistUrl('https://raw.githubusercontent.com/other/repo/main/x.m3u')).toBe(false);
    expect(isApprovedPlaylistUrl('http://raw.githubusercontent.com/daftarlayl2-creator/iptv/master/streams/ma.m3u')).toBe(false);
    expect(isApprovedPlaylistUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isApprovedPlaylistUrl('not a url')).toBe(false);
  });

  it('defaults to verified country files and respects IPTV_COUNTRIES', () => {
    const sources = resolvePlaylistSources();
    expect(sources).toEqual([
      { url: 'https://raw.githubusercontent.com/daftarlayl2-creator/iptv/master/streams/ma.m3u', label: 'ma.m3u', region: 'MA' },
    ]);
  });

  it('drops non-allowlisted explicit playlist URLs', () => {
    vi.stubEnv('IPTV_PLAYLIST_URLS', 'https://evil.example.com/x.m3u, https://raw.githubusercontent.com/daftarlayl2-creator/iptv/master/streams/fr.m3u');
    expect(resolvePlaylistSources().map((s) => s.label)).toEqual(['fr.m3u']);
  });
});

describe('catalogue loading', () => {
  it('parses EXTINF metadata, skips malformed/unsafe entries and dedupes', async () => {
    stubFetch({ 'ma.m3u': () => new Response(MA_M3U, { status: 200 }) });
    const catalog = await getIptvCatalog();

    expect(catalog.channels.map((c) => c.name)).toEqual(['Arryadia', '2M']); // sorted region → category → name
    const first = catalog.channels.find((c) => c.name === '2M')!;
    const sports = catalog.channels.find((c) => c.name === 'Arryadia')!;
    expect(first.tvgId).toBe('2M.ma@SD');
    expect(first.logo).toBe('https://example.com/2m.png');
    expect(first.region).toBe('MA');
    expect(first.category).toBe('Uncategorized');
    expect(sports.category).toBe('Sports');
    expect(sports.referer).toBe('https://www.example.ma/');
    expect(catalog.categories).toEqual(['Sports', 'Uncategorized']);
    expect(catalog.regions).toEqual(['MA']);
    expect(catalog.sources).toEqual([{ playlist: 'ma.m3u', ok: true, count: 2 }]);
    expect(catalog.stale).toBe(false);
  });

  it('keeps the catalogue when one playlist fails', async () => {
    vi.stubEnv('IPTV_COUNTRIES', 'ma,fr');
    stubFetch({
      'ma.m3u': () => new Response(MA_M3U, { status: 200 }),
      'fr.m3u': () => new Response('down', { status: 503 }),
    });
    const catalog = await getIptvCatalog();
    expect(catalog.channels.length).toBe(2);
    expect(catalog.sources).toContainEqual({ playlist: 'fr.m3u', ok: false, count: 0 });
  });

  it('serves the last known valid catalogue (marked stale) after a total refresh failure', async () => {
    stubFetch({ 'ma.m3u': () => new Response(MA_M3U, { status: 200 }) });
    const good = await getIptvCatalog();
    expect(good.channels.length).toBe(2);

    stubFetch({ 'ma.m3u': () => new Response('down', { status: 503 }) });
    const stale = await getIptvCatalog();
    expect(stale.stale).toBe(true);
    expect(stale.channels.map((c) => c.name)).toEqual(['Arryadia', '2M']);
  });

  it('returns an honest empty catalogue when nothing has ever loaded', async () => {
    stubFetch({ 'ma.m3u': () => new Response('down', { status: 503 }) });
    const catalog = await getIptvCatalog();
    expect(catalog.channels).toEqual([]);
    expect(catalog.stale).toBe(false);
  });

  it('looks channels up by stable id and strips raw URLs from public entries', async () => {
    stubFetch({ 'ma.m3u': () => new Response(MA_M3U, { status: 200 }) });
    const catalog = await getIptvCatalog();
    const target = catalog.channels.find((c) => c.name === '2M')!;
    const channel = await getIptvChannelById(target.id);
    expect(channel?.name).toBe('2M');
    const pub = toPublicChannel(channel!);
    expect(pub.href).toBe(`/iptv/${channel!.id}`);
    expect(JSON.stringify(pub)).not.toContain('cdn.example.com');
    expect(await getIptvChannelById('iptv-nope')).toBeNull();
  });
});
