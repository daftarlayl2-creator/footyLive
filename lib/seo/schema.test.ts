import { describe, expect, it } from 'vitest';
import { breadcrumbSchema, sportsTeamSchema } from './schema';

describe('schema.org builders', () => {
  it('emits a BreadcrumbList with schema.org-correct ListItem types', () => {
    const schema = breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Standings', path: '/standings' },
      { name: 'Arsenal', path: '/club/359-arsenal' },
    ])!;
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    items.forEach((item, index) => {
      expect(item['@type']).toBe('ListItem');
      expect(item.position).toBe(index + 1); // Number, not a string
      expect(typeof item.position).toBe('number');
      expect(typeof item.name).toBe('string');
      expect(String(item.item)).toMatch(/^https:\/\/www\.eviv\.si\//); // URL, not a path
    });
    expect(items[2].item).toBe('https://www.eviv.si/club/359-arsenal');
    expect(breadcrumbSchema([])).toBeNull();
  });

  it('emits a SportsTeam with the required name and typed optional fields', () => {
    const schema = sportsTeamSchema({
      name: 'Maghreb Fès',
      id: '359',
      url: '/club/359-maghreb-fes',
      logo: 'https://cdn.example/crest.png',
      venue: 'Stade de Fès',
      description: 'Botola Pro club profile on Limon Live.',
    })!;
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: 'Maghreb Fès',
      sport: 'Football',
      url: 'https://www.eviv.si/club/359-maghreb-fes',
      logo: 'https://cdn.example/crest.png',
      location: { '@type': 'Place', name: 'Stade de Fès' },
    });
    expect(String(schema['@id'])).toContain('#team');
  });

  it('drops unsafe URLs and never invents missing facts', () => {
    expect(sportsTeamSchema({ name: '   ' })).toBeNull();
    const schema = sportsTeamSchema({ name: 'Wydad AC', logo: 'javascript:alert(1)', url: 'https://user:pass@evil.example/x' })!;
    expect(schema.logo).toBeUndefined();
    expect(schema.url).toBeUndefined();
    expect(schema.location).toBeUndefined();
    expect(sportsTeamSchema({ name: 'Wydad AC', id: 12 })!['@id']).toContain('/club/12');
  });
});
