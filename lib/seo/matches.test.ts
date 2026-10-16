import { afterEach, describe, expect, it, vi } from 'vitest';
import { absoluteUrl, serializeJsonLd, siteUrl } from './site';
import { matchHref, matchIdFromSlug, matchMetadata, slugify, sportsEventSchema } from './matches';

const match = { id: 'espn-12345', title: 'Fès vs Atlético', homeTeam: { name: 'Maghreb Fès', badge: 'https://cdn.example/home.png' }, awayTeam: { name: 'Atlético Madrid', badge: '' }, tournament: 'Club World Cup', timestamp: Date.parse('2026-10-15T20:00:00Z'), status: 'live', venue: 'Stade de Fès' };
afterEach(() => vi.unstubAllEnvs());

describe('programmatic match SEO', () => {
  it('builds descriptive stable URLs with reversible fixture ids and normalized accents', () => {
    const path = matchHref(match);
    expect(path).toBe('/match/maghreb-fes-vs-atletico-madrid-club-world-cup-2026-10-15--espn-12345');
    expect(matchIdFromSlug(path.split('/').at(-1)!)).toBe(match.id);
    expect(matchIdFromSlug('espn-12345')).toBe(match.id); // legacy /match/[id]
    expect(slugify(' PSG / Real Madrid? ')).toBe('psg-real-madrid');
    expect(matchHref({ id: '77', title: 'الرجاء ضد الوداد' })).toBe('/match/football-match--77');
  });
  it.each(['../secret', 'x--', 'x--<script>', 'x'.repeat(301), 'x--id--bad/path'])('rejects unsafe or malformed slugs: %s', (slug) => {
    expect(matchIdFromSlug(slug)).toBeNull();
  });
  it('canonicalizes legacy watch pages and provides fixture-specific social metadata', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://scores.example');
    const metadata = matchMetadata(match);
    expect(metadata.alternates?.canonical).toBe(`https://scores.example${matchHref(match)}`);
    expect(metadata.title).toContain('Maghreb Fès vs Atlético Madrid — Live Score');
    expect(metadata.description).toContain('2026-10-15');
    expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
    expect(matchMetadata({ ...match, status: 'finished' }).title).toContain('Result & Stats');
    expect(matchMetadata(null).robots).toEqual({ index: false, follow: false });
  });
  it('emits a SportsEvent with sourced teams, kickoff, competition, venue and canonical URL', () => {
    const schema = sportsEventSchema(match)!;
    expect(schema).toMatchObject({ '@context': 'https://schema.org', '@type': 'SportsEvent', sport: 'Football', startDate: '2026-10-15T20:00:00.000Z', eventStatus: 'https://schema.org/EventScheduled', homeTeam: { '@type': 'SportsTeam', name: 'Maghreb Fès' }, awayTeam: { '@type': 'SportsTeam', name: 'Atlético Madrid' }, location: { '@type': 'Place', name: 'Stade de Fès' } });
    expect(schema.url).toBe(absoluteUrl(matchHref(match)));
    expect(schema.offers).toBeUndefined(); // a VIP pass is not a stadium ticket
    expect(schema.endDate).toBeUndefined();
  });
  it('does not publish missing/fake event facts or unsafe remote images', () => {
    expect(sportsEventSchema({ id: 'unknown' })).toBeNull();
    expect(sportsEventSchema({ ...match, timestamp: 0 })).toBeNull();
    expect(sportsEventSchema({ ...match, timestamp: NaN })).toBeNull();
    expect(sportsEventSchema({ ...match, timestamp: 1e30 })).toBeNull();
    expect(() => matchHref({ ...match, timestamp: 1e30 })).not.toThrow();
    const schema = sportsEventSchema({ ...match, venue: '', poster: 'javascript:alert(1)', status: 'postponed' })!;
    expect(schema.location).toBeUndefined(); expect(schema.image).toBeUndefined();
    expect(schema.eventStatus).toBe('https://schema.org/EventPostponed');
  });
  it('escapes provider text so JSON-LD cannot terminate its script element', () => {
    const raw = { name: '</script><script>alert(1)</script> & \u2028\u2029' };
    const encoded = serializeJsonLd(raw);
    expect(encoded).not.toContain('<'); expect(encoded).not.toContain('&');
    expect(encoded).toContain('\\u003c'); expect(JSON.parse(encoded)).toEqual(raw);
  });
  it('uses an explicit deployment origin and rejects credential-bearing URLs', () => {
    expect(siteUrl('https://scores.example/a?b=c')).toBe('https://scores.example');
    expect(siteUrl('javascript:alert(1)')).toBe('https://eviv.live');
    expect(siteUrl('https://name:pass@evil.example')).toBe('https://eviv.live');
  });
});
