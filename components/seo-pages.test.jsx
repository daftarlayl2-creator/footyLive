import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WatchPage, { generateMetadata as watchMetadata } from '@/app/watch/[matchId]/page';
import MatchPage, { generateMetadata as slugMetadata } from '@/app/match/[slug]/page';
import PlayerPage, { generateMetadata as playerMetadata } from '@/app/player/[id]/page';
import { matchHref } from '@/lib/seo/matches';
import { buildProxyUrl } from '@/lib/hlsProxy';

const services = vi.hoisted(() => ({ details: vi.fn(), streams: vi.fn(), stats: vi.fn(), player: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/streamEngine', () => ({ getMatchDetails: services.details, resolveAllStreams: services.streams, getMatchStats: services.stats }));
vi.mock('@/lib/players/playerProfile', () => ({ getPlayerProfile: services.player }));
vi.mock('@/lib/subscription/server', () => ({ getServerSubscription: async () => ({ grants: [] }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  permanentRedirect: (url) => { services.redirect(url); throw new Error('redirect'); },
  notFound: () => { services.notFound(); throw new Error('not-found'); },
}));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
// These sections have their own interaction suites; here exercise real page composition + schema.
vi.mock('@/components/predictions/MatchInsights', () => ({ default: () => null }));
vi.mock('@/components/chat/MatchChatPanel', () => ({ default: () => null }));
const fixture = { id: 'espn-77', title: 'Arsenal vs Liverpool', tournament: 'Premier League', timestamp: Date.parse('2026-10-15T18:00:00Z'), homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Liverpool' }, status: 'live', homeScore: 1, awayScore: 0, venue: 'Emirates Stadium' };
beforeEach(() => {
  services.details.mockReset().mockResolvedValue(fixture);
  services.stats.mockReset().mockResolvedValue(null);
  services.streams.mockReset().mockResolvedValue({ channels: [{ name: 'Live HD', quality: 'HD', url: buildProxyUrl('https://cdn.example/live.m3u8') }] });
  services.player.mockReset();
  services.redirect.mockReset(); services.notFound.mockReset();
});

describe('live page SEO integration', () => {
  it('server-renders escaped SportsEvent JSON-LD into the match page without waiting for client JavaScript', async () => {
    const element = await WatchPage({ params: Promise.resolve({ matchId: fixture.id }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);
    const script = /<script type="application\/ld\+json">([^]*?)<\/script>/.exec(html);
    expect(script).not.toBeNull();
    const schema = JSON.parse(script[1]);
    expect(schema['@type']).toBe('SportsEvent');
    expect(schema.startDate).toBe('2026-10-15T18:00:00.000Z');
    expect(schema.homeTeam.name).toBe('Arsenal');
    expect(html).toContain('<h1'); expect(html).toContain('Arsenal vs Liverpool');
    expect(schema.url).toContain(matchHref(fixture));
  });
  it('uses one canonical descriptive URL in both watch and match metadata', async () => {
    const watch = await watchMetadata({ params: Promise.resolve({ matchId: fixture.id }) });
    const slug = await slugMetadata({ params: Promise.resolve({ slug: matchHref(fixture).split('/').at(-1) }) });
    expect(watch.alternates.canonical).toBe(slug.alternates.canonical);
    expect(watch.title).toContain('Live Score');
  });
  it('permanently redirects raw/incorrect match slugs while preserving only a safe tab parameter', async () => {
    await expect(MatchPage({ params: Promise.resolve({ slug: fixture.id }), searchParams: Promise.resolve({ tab: 'live', junk: 'x' }) })).rejects.toThrow('redirect');
    expect(services.redirect).toHaveBeenCalledWith(`${matchHref(fixture)}?tab=live`);
    await expect(MatchPage({ params: Promise.resolve({ slug: `wrong--${fixture.id}` }), searchParams: Promise.resolve({ tab: '//evil.example' }) })).rejects.toThrow('redirect');
    expect(services.redirect).toHaveBeenLastCalledWith(matchHref(fixture));
  });
  it('explains premium-only responses instead of claiming valid FHD sources are offline', async () => {
    services.streams.mockResolvedValue({ channels: [{ name: 'Live FHD', quality: 'FHD', url: buildProxyUrl('https://cdn.example/fhd.m3u8') }] });
    const html = renderToStaticMarkup(await WatchPage({ params: Promise.resolve({ matchId: fixture.id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('data-stream-resolver="premium"');
    expect(html).toContain('VIP-quality sources found');
    expect(html).toContain('Next check in');
  });
  it('server-renders escaped Person schema, a stable canonical, and the branded portrait fallback', async () => {
    const name = 'Player </script>';
    services.player.mockResolvedValue({ id: '12345', name, fullName: name, nationality: 'Morocco', jersey: '9', position: 'Forward', season: { label: 'Season not reported' }, honors: [] });
    const props = { params: Promise.resolve({ id: '12345' }), searchParams: Promise.resolve({ club: '359' }) };
    const html = renderToStaticMarkup(await PlayerPage(props));
    const script = /<script type="application\/ld\+json">([^]*?)<\/script>/.exec(html);
    expect(JSON.parse(script[1])).toMatchObject({ '@type': 'Person', name, nationality: 'Morocco' });
    expect(script[1]).not.toContain('</script>');
    expect(html).toContain('data-player-silhouette'); expect(html).toContain('data-player-number-badge');
    expect((await playerMetadata(props)).alternates.canonical).toMatch(/\/player\/12345$/);
  });
  it('does not invent a kickoff or emit a SportsEvent for a missing fixture', async () => {
    services.details.mockResolvedValue(null);
    await expect(WatchPage({ params: Promise.resolve({ matchId: 'missing' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
    expect(services.streams).not.toHaveBeenCalled();
    expect(await watchMetadata({ params: Promise.resolve({ matchId: 'missing' }) })).toMatchObject({ robots: { index: false } });
  });
});
