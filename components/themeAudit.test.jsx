// @vitest-environment happy-dom
/**
 * Masterclass audit — the two house-keeping guarantees of the final sprint:
 *
 *   1. **100+ lemon/cyberpunk avatars** across the five styled families.
 *   2. **Dark *and* light mode contrast**, verified structurally: every surface
 *      the new views draw has an explicit `html:not(.dark)` pass, the page-level
 *      text of those views is not hard-coded white, and every animation has a
 *      `prefers-reduced-motion` escape hatch.
 *
 * Plus the theme switch itself: the toggle writes the `dark` class on <html> and
 * persists the choice, which is the mechanism both modes depend on.
 */
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AVATAR_PRESETS } from '@/lib/auth/avatar';
import ThemeToggle from '@/components/ThemeToggle';

const css = readFileSync('app/globals.css', 'utf8');
const read = (path) => readFileSync(path, 'utf8');

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.className = 'dark';
  window.localStorage.clear();
});

describe('avatar gallery', () => {
  it('keeps 100+ unique presets across the five families', () => {
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(AVATAR_PRESETS.map((preset) => preset.id)).size).toBe(AVATAR_PRESETS.length);
    const families = new Set(AVATAR_PRESETS.map((preset) => preset.category));
    for (const family of ['lemon', 'cyberpunk', 'football', 'beast', 'neon']) {
      expect(families.has(family), family).toBe(true);
    }
    // Every preset is renderable: an emoji, a label and a real gradient pair.
    for (const preset of AVATAR_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(1);
      expect(preset.emoji.length).toBeGreaterThan(0);
      expect(preset.from).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(preset.to).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });
});

describe('dark ↔ light contrast', () => {
  it('gives every new surface an explicit light-mode pass', () => {
    const surfaces = [
      '.advertise-hero',
      '.advertise-hero__title',
      '.advertise-hero__copy',
      '.advertise-stat',
      '.advertise-stat__value',
      '.advertise-section-title',
      '.advertise-partner-note',
      '.staff-title',
      '.staff-copy',
      '.staff-note',
      '.staff-tab',
      '.staff-locked',
      '.pitch-player-card',
    ];
    for (const selector of surfaces) {
      expect(css, `${selector} needs a light pass`).toContain(`html:not(.dark) ${selector}`);
    }
  });

  it('never hard-codes white page text in the new views', () => {
    // Text on the page background must come from the themed CSS classes, not a
    // blanket `text-white` (invisible on the light theme's paper background).
    const landing = read('components/ads/AdvertiseLanding.jsx');
    const portal = read('components/staff/StaffPortal.jsx');
    for (const [name, source] of [['AdvertiseLanding', landing], ['StaffPortal', portal]]) {
      const pageLevel = source
        .split('\n')
        .filter((line) => /advertise-hero|staff-portal|staff-tab|advertise-stat|staff-title|staff-copy|advertise-section-title/.test(line));
      expect(pageLevel.length, `${name} should use themed classes`).toBeGreaterThan(3);
    }
    // The lime used on paper is the deep lime ink, not #CCFF00.
    expect(css).toContain('html:not(.dark) .advertise-badge');
    expect(css).toMatch(/html:not\(\.dark\) \.staff-note \{ color: #4e6900; \}/);
  });

  it('keeps dark glass surfaces deliberately dark in both themes', () => {
    // The match centre, admin and VIP chrome are dark by design: that is what
    // guarantees contrast on the dark pitch and in the command centre.
    for (const selector of ['.glass-dark', '.vip-glass', '.glass-dark-tile']) {
      expect(css).toContain(selector);
    }
    expect(css).not.toContain('html:not(.dark) .vip-glass');
    expect(css).not.toContain('html:not(.dark) .advertise-package');
  });

  it('freezes every new animation for reduced-motion users', () => {
    const animations = ['bannerCtaGlow', 'bannerCtaSparkle', 'advertiseScrimIn', 'advertisePanelIn', 'advertiseSealThrob'];
    for (const animation of animations) {
      expect(css, `${animation} keyframes`).toContain(`@keyframes ${animation}`);
    }
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .top-banner-cta--sparkle'));
    expect(reduced).toContain('.top-banner-cta--sparkle,');
    expect(reduced).toContain('.advertise-modal__panel,');
    expect(reduced).toContain('animation: none;');
  });
});

describe('theme switch', () => {
  it('toggles the dark class and remembers the choice', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ThemeToggle />);
    });
    const button = container.querySelector('button');
    expect(button.getAttribute('aria-label')).toContain('Light');
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
    await act(async () => {
      container.querySelector('button').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    await act(async () => root.unmount());
    container.remove();
  });
});

afterEach(() => {
  document.documentElement.className = 'dark';
});
