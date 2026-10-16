import { describe, expect, it } from 'vitest';
import { COUNTRIES, ageFromBirthdate, findCountry, flagCss, isCountryCode, normalizeCountryCode } from './countries';

describe('country catalog', () => {
  it('pins Morocco first for the Limon Live home crowd', () => {
    expect(COUNTRIES[0].code).toBe('MA');
  });

  it('has unique codes, names and paintable flag art on every row', () => {
    const codes = new Set<string>();
    for (const country of COUNTRIES) {
      expect(codes.has(country.code), `duplicate code ${country.code}`).toBe(false);
      codes.add(country.code);
      expect(country.name.length).toBeGreaterThan(1);
      expect(country.stripes.length).toBeGreaterThan(0);
      const css = flagCss(country);
      expect(css).toMatch(/^linear-gradient\((?:90|180)deg,/);
      // Hard stops make crisp stripes (no blurry blends).
      expect(css).toContain('%');
    }
  });

  it('weights oversized stripes (Spain/Colombia style) proportionally', () => {
    const spain = findCountry('ES')!;
    const css = flagCss(spain);
    // 1:2:1 split → yellow runs 25%→75%.
    expect(css).toContain('#F1BF00 25.00%');
    expect(css).toContain('#F1BF00 75.00%');
    expect(css).toContain('180deg'); // horizontal stripes
  });

  it('paints vertical stripes across the flag', () => {
    expect(flagCss(findCountry('FR')!)).toContain('90deg');
    expect(flagCss(findCountry('IT')!)).toContain('#009246');
  });

  it('resolves lookup + normalization safely', () => {
    expect(findCountry('ma')?.name).toBe('Morocco');
    expect(normalizeCountryCode(' es ')).toBe('ES');
    expect(normalizeCountryCode('xx')).toBeNull();
    expect(normalizeCountryCode(42)).toBeNull();
    expect(isCountryCode('MA')).toBe(true);
    expect(isCountryCode('<script>')).toBe(false);
  });
});

describe('ageFromBirthdate', () => {
  const NOW = new Date('2026-10-16T12:00:00Z');

  it('computes full years with the birthday rule', () => {
    expect(ageFromBirthdate('2000-10-16', NOW)).toBe(26);
    expect(ageFromBirthdate('2000-10-17', NOW)).toBe(25);
    expect(ageFromBirthdate('2000-10-15', NOW)).toBe(26);
  });

  it('rejects impossible, future and absurd dates', () => {
    expect(ageFromBirthdate('2030-01-01', NOW)).toBeNull();
    expect(ageFromBirthdate('2021-02-29', NOW)).toBeNull(); // 2021 not a leap year
    expect(ageFromBirthdate('1800-06-01', NOW)).toBeNull();
    expect(ageFromBirthdate('16/10/2000', NOW)).toBeNull();
    expect(ageFromBirthdate('')).toBeNull();
    expect(ageFromBirthdate(null)).toBeNull();
  });
});
