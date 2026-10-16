/**
 * Fan identity fields (birthdate + country) across validation and the
 * device-local account backend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeBirthdate, sanitizeCountryCode, validateBirthdate } from './validation';
import { LOCAL_ACCOUNTS_KEY, createLocalAuth } from './localAuth';

const NOW = Date.parse('2026-10-16T12:00:00Z');

describe('birthdate + country validation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  it('accepts ISO dates, keeps them verbatim, and allows clearing', () => {
    expect(sanitizeBirthdate('1995-04-12')).toBe('1995-04-12');
    expect(sanitizeBirthdate('')).toBeNull();
    expect(sanitizeBirthdate(null)).toBeNull();
    expect(validateBirthdate('1995-04-12')).toBeNull();
  });

  it('rejects malformed, future and too-young dates', () => {
    expect(sanitizeBirthdate('12/04/1995')).toBeUndefined();
    expect(sanitizeBirthdate('2021-02-29')).toBeUndefined();
    expect(sanitizeBirthdate('2030-05-01')).toBeUndefined();
    expect(validateBirthdate('2030-05-01')).toMatch(/real birth date/i);
    // Under the minimum fan age (five today).
    expect(validateBirthdate('2024-01-01')).toMatch(/at least 5/i);
  });

  it('only keeps selectable country codes', () => {
    expect(sanitizeCountryCode('ma')).toBe('MA');
    expect(sanitizeCountryCode('')).toBeNull();
    expect(sanitizeCountryCode('atlantis')).toBeUndefined();
    expect(sanitizeCountryCode(7)).toBeUndefined();
  });
});

describe('device-local accounts keep fan identity', () => {
  const storage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      dump: () => map.get(LOCAL_ACCOUNTS_KEY) || '[]',
    };
  };

  it('round-trips birthdate and countryCode through sign-up and updateProfile', async () => {
    const store = storage();
    const auth = createLocalAuth(store, { iterations: 1, now: () => NOW });
    const signUp = await auth.signUp({ email: 'Fan@Limon.app', password: 'tifosa9lima', displayName: 'Tifosa' });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) return;
    expect(signUp.user.birthdate).toBeNull();
    expect(signUp.user.countryCode).toBeNull();

    const updated = auth.updateProfile(signUp.user.id, { birthdate: '1998-12-25', countryCode: 'ma' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.user.birthdate).toBe('1998-12-25');
    expect(updated.user.countryCode).toBe('MA');
    // Persisted under the hood, and reloaded users see the same values.
    expect(store.dump()).toContain('1998-12-25');
    expect(auth.getUser(signUp.user.id)?.countryCode).toBe('MA');

    // Clearing works too.
    const cleared = auth.updateProfile(signUp.user.id, { birthdate: null, countryCode: null });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.user.birthdate).toBeNull();
      expect(cleared.user.countryCode).toBeNull();
    }
  });

  it('rejects junk values without touching the stored profile', async () => {
    const store = storage();
    const auth = createLocalAuth(store, { iterations: 1, now: () => NOW });
    const signUp = await auth.signUp({ email: 'fan2@limon.app', password: 'tifosa9lima', displayName: 'Ultras' });
    if (!signUp.ok) throw new Error('signup failed');
    const bad = auth.updateProfile(signUp.user.id, { countryCode: 'not-a-country' });
    expect(bad.ok).toBe(false);
    const badDate = auth.updateProfile(signUp.user.id, { birthdate: '2999-01-01' });
    expect(badDate.ok).toBe(false);
    expect(auth.getUser(signUp.user.id)?.countryCode).toBeNull();
  });
});
