import { describe, expect, it } from 'vitest';
import {
  createAdminSessionToken,
  validateAdminCredentials,
  verifyAdminSessionToken,
} from './adminAuth';

describe('adminAuth', () => {
  it('validates the configured admin username and password using constant-time comparison', () => {
    expect(validateAdminCredentials('mounadel', 'Riihabtii95@')).toBe(true);
    expect(validateAdminCredentials('mounadel', 'wrong')).toBe(false);
    expect(validateAdminCredentials('other', 'Riihabtii95@')).toBe(false);
    expect(validateAdminCredentials(null, undefined)).toBe(false);
  });

  it('signs and verifies time-bounded session tokens', () => {
    const now = 1_700_000_000_000;
    const token = createAdminSessionToken(now);

    expect(verifyAdminSessionToken(token, now + 1000)).toBe(true);
    // Expired after 12 hours
    expect(verifyAdminSessionToken(token, now + 13 * 60 * 60 * 1000)).toBe(false);
    // Tampered signature or expiry rejected
    expect(verifyAdminSessionToken(`${token}a`, now + 1000)).toBe(false);
    expect(verifyAdminSessionToken(`9999999999999.${token.split('.')[1]}`, now + 1000)).toBe(false);
    expect(verifyAdminSessionToken('', now)).toBe(false);
    expect(verifyAdminSessionToken(null, now)).toBe(false);
  });
});
