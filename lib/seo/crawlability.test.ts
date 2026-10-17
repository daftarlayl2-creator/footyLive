import { describe, expect, it, vi } from 'vitest';
import robots, { AI_CRAWLERS } from '@/app/robots';
import sitemap from '@/app/sitemap';

const services = vi.hoisted(() => ({ matches: vi.fn() }));
vi.mock('@/lib/streamEngine', () => ({ getMatches: services.matches }));

const fixtures = [
  { id: 'espn-1', title: 'Arsenal vs Liverpool', tournament: 'Premier League', timestamp: Date.parse('2026-10-16T18:00:00Z'), status: 'live', homeTeam: { id: '359', name: 'Arsenal' }, awayTeam: { id: '364', name: 'Liverpool' } },
  { id: 'espn-2', title: 'Wydad vs Raja', tournament: 'Botola Pro', timestamp: Date.parse('2026-10-16T20:00:00Z'), status: 'scheduled', homeTeam: { name: 'Wydad AC' }, awayTeam: { name: 'Raja Casablanca' } },
];

describe('crawlability', () => {
  it('keeps staff, dev-hub and API surfaces protected while welcoming AI search bots on public pages', () => {
    const config = robots();
    expect(config.sitemap).toBe('https://www.eviv.si/sitemap.xml');
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const covered = rules.map((rule) => rule.userAgent);
    for (const bot of AI_CRAWLERS) expect(covered).toContain(bot);
    expect(covered).toContain('*');
    for (const rule of rules) {
      expect(rule.allow).toContain('/');
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow).toEqual(expect.arrayContaining(['/staff', '/mounadel', '/api/']));
    }
  });

  it('lists public static routes, live match URLs and fixture-linked club pages — never private routes', async () => {
    services.matches.mockResolvedValue(fixtures);
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    for (const path of ['https://www.eviv.si/', 'https://www.eviv.si/standings', 'https://www.eviv.si/highlights', 'https://www.eviv.si/pricing', 'https://www.eviv.si/advertise', 'https://www.eviv.si/spin', 'https://www.eviv.si/leaderboard', 'https://www.eviv.si/about', 'https://www.eviv.si/contact', 'https://www.eviv.si/privacy', 'https://www.eviv.si/terms', 'https://www.eviv.si/copyright', 'https://www.eviv.si/api-partnerships', 'https://www.eviv.si/submit']) {
      expect(urls).toContain(path);
    }
    // Phase 2: Live TV is hidden by default, so /channels stays out of the
    // sitemap until NEXT_PUBLIC_LIVE_TV_ENABLED=true.
    expect(urls).not.toContain('https://www.eviv.si/channels');
    expect(urls).toContain('https://www.eviv.si/match/arsenal-vs-liverpool-premier-league-2026-10-16--espn-1');
    // Club pages come from real fixture teams only (id-form and name-form).
    expect(urls).toContain('https://www.eviv.si/club/359-arsenal');
    expect(urls).toContain('https://www.eviv.si/club/wydad-ac');
    for (const path of ['/staff', '/mounadel', '/api-hub', '/multistream', '/profile', '/inbox', '/auth']) {
      expect(urls.some((url) => url.includes(path))).toBe(false);
    }
  });

  it('degrades to the static route set when the fixture feed is down', async () => {
    services.matches.mockRejectedValue(new Error('upstream down'));
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://www.eviv.si/');
    // Static set while Live TV is hidden: 8 legacy routes − /channels
    // + 7 informational pages (about…submit) = 14.
    expect(urls).toHaveLength(14);
  });

  it('includes /channels only while Live TV is enabled (Phase 2 reversibility)', async () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    services.matches.mockRejectedValue(new Error('upstream down'));
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://www.eviv.si/channels');
    expect(urls).toHaveLength(15);
    vi.unstubAllEnvs();
  });
});
