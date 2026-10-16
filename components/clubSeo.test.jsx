import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClubPage, { generateMetadata } from '@/app/club/[id]/page';

const services = vi.hoisted(() => ({
  resolve: vi.fn(),
  core: vi.fn(),
  facts: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock('@/lib/clubs/clubProfile', () => ({
  resolveClub: services.resolve,
  getClubCore: services.core,
  getClubFacts: services.facts,
}));
vi.mock('next/navigation', () => ({ notFound: () => { services.notFound(); throw new Error('not-found'); } }));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
// Hero/facts/tabs have their own suites; here exercise page-level SEO output.
vi.mock('@/components/club/ClubHero', () => ({ default: ({ children }) => <div data-hero>{children}</div>, FactTile: () => null, FactTilesSkeleton: () => null }));
vi.mock('@/components/club/ClubFacts', () => ({ ClubAbout: () => null, ClubAboutSkeleton: () => null, ClubFactTiles: () => null }));
vi.mock('@/components/club/ClubTabs', () => ({ default: () => null }));
vi.mock('@/components/ui/BackButton', () => ({ default: () => null }));

const core = {
  club: { espnId: '359', name: 'Arsenal', league: { slug: 'eng.1', name: 'Premier League' }, logo: 'https://cdn.example/arsenal.png' },
  results: [], fixtures: [], squad: [], form: ['W'], homeVenue: 'Emirates Stadium', updatedAt: 0,
};
beforeEach(() => {
  services.resolve.mockReset().mockResolvedValue({ espnId: '359', slug: 'arsenal' });
  services.core.mockReset().mockResolvedValue(core);
  services.facts.mockReset();
  services.notFound.mockReset();
});

describe('club page SEO', () => {
  it('uses the club title pattern with a self-referential canonical and league-aware description', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id: '359-arsenal' }) });
    expect(metadata.title).toBe('Arsenal Fixtures, Roster & Live Standings | Limon Live');
    expect(metadata.description).toContain('Premier League');
    expect(metadata.description).toContain('Arsenal');
    expect(metadata.alternates.canonical).toBe('https://www.eviv.si/club/359-arsenal');
  });

  it('server-renders valid SportsTeam and BreadcrumbList JSON-LD', async () => {
    const html = renderToStaticMarkup(await ClubPage({ params: Promise.resolve({ id: '359-arsenal' }) }));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const team = scripts.find((s) => s['@type'] === 'SportsTeam');
    const crumbs = scripts.find((s) => s['@type'] === 'BreadcrumbList');
    expect(team).toMatchObject({ name: 'Arsenal', sport: 'Football', url: 'https://www.eviv.si/club/359-arsenal', logo: 'https://cdn.example/arsenal.png', location: { '@type': 'Place', name: 'Emirates Stadium' } });
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.eviv.si/' },
      { '@type': 'ListItem', position: 2, name: 'Standings', item: 'https://www.eviv.si/standings' },
      { '@type': 'ListItem', position: 3, name: 'Arsenal', item: 'https://www.eviv.si/club/359-arsenal' },
    ]);
  });

  it('gives the Wikipedia lite profile the same canonical + schema treatment', async () => {
    services.resolve.mockResolvedValue({ espnId: null, slug: 'maghreb-de-fes' });
    services.core.mockResolvedValue(null);
    services.facts.mockResolvedValue({ summary: { title: 'Maghreb de Fès', thumbnail: 'javascript:alert(1)', url: 'https://fr.wikipedia.org/wiki/x' } });
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'maghreb-de-fes' }) });
    expect(metadata.title).toBe('Maghreb de Fes Fixtures, Roster & Live Standings | Limon Live');
    expect(metadata.alternates.canonical).toBe('https://www.eviv.si/club/maghreb-de-fes');
    const html = renderToStaticMarkup(await ClubPage({ params: Promise.resolve({ id: 'maghreb-de-fes' }) }));
    expect(html).toContain('"@type":"SportsTeam"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('javascript:');
  });
});
