import { describe, expect, it } from 'vitest';
import { AVATAR_PRESETS, presetFor } from '@/lib/auth/avatar';
import { sanitizeAvatarUrl } from '@/lib/auth/localAuth';

describe('Expanded Avatar Gallery (100+ presets)', () => {
  it('contains over 100 unique cyberpunk, lemon, football and beast presets', () => {
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(100);
    const ids = new Set(AVATAR_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(AVATAR_PRESETS.length);
  });

  it('every preset ID satisfies strict validation regex (^preset:[a-z0-9-]{1,24}$)', () => {
    for (const preset of AVATAR_PRESETS) {
      expect(preset.id).toMatch(/^[a-z0-9-]{1,24}$/);
      expect(preset.label).toBeTruthy();
      expect(preset.emoji).toBeTruthy();
      expect(preset.from).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(preset.to).toMatch(/^#[0-9a-fA-F]{6}$/);

      // Sanitize check
      const value = `preset:${preset.id}`;
      expect(sanitizeAvatarUrl(value)).toBe(value);
      expect(presetFor(value)).toEqual(preset);
    }
  });

  it('includes core Limon Lime and Golden Lemon presets', () => {
    const eagle = presetFor('preset:eagle');
    expect(eagle?.label).toBe('Limon Lime');
    expect(eagle?.emoji).toBe('🍋');

    const gold = presetFor('preset:lemon-gold');
    expect(gold?.label).toBe('Golden Lemon');
    expect(gold?.emoji).toBe('🪙');
  });

  it('includes rich cyberpunk netrunner and football striker styles', () => {
    expect(presetFor('preset:cyber-hacker')?.label).toBe('Netrunner');
    expect(presetFor('preset:cyber-samurai')?.label).toBe('Cyber Samurai');
    expect(presetFor('preset:striker')?.label).toBe('Striker');
    expect(presetFor('preset:beast-lion')?.label).toBe('Atlas Lion');
  });
});
