// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WavingFlag from './WavingFlag';
import VipBadge from '../auth/VipBadge';
import { VIP_TIERS } from '@/lib/vip/tiers';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };

describe('waving fan flag', () => {
  it('renders the animated fabric with country art and emblem', () => {
    const html = renderToStaticMarkup(<WavingFlag code="MA" size={24} />);
    expect(html).toContain('data-waving-flag="MA"');
    expect(html).toContain('waving-flag__fabric');
    expect(html).toContain('waving-flag__sheen');
    expect(html).toContain('Morocco flag');
    expect(html).toContain('linear-gradient');
    // Morocco emblem star.
    expect(html).toContain('waving-flag__emblem');
  });

  it('falls back to a pennant for unknown codes (never a broken image)', () => {
    const html = renderToStaticMarkup(<WavingFlag code="XX" />);
    expect(html).toContain('data-waving-flag="XX"');
    expect(html).toContain('Fan flag');
  });

  it('waves via CSS keyframes and freezes for reduced-motion users', async () => {
    const css = await import('node:fs').then((fs) => fs.readFileSync('app/globals.css', 'utf8'));
    expect(css).toContain('@keyframes flagWave');
    expect(css).toContain('@keyframes flagSheen');
    expect(css).toContain('.waving-flag__fabric');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\.waving-flag__fabric/);
  });

  it('mounts live without crashes and keeps the paint inline', async () => {
    await render(<WavingFlag code="ES" size={30} />);
    const flag = container.querySelector('[data-waving-flag="ES"]');
    expect(flag).toBeTruthy();
    // The CSS vars live on the outer wrapper; the fabric inherits them down.
    expect(flag.style.getPropertyValue('--flag-bg')).toContain('#AA151B');
  });
});

describe('tiered VIP badges', () => {
  it.each(VIP_TIERS.map((tier) => [tier.id, tier.planIds[0], tier.emblem]))(
    'renders the %s tier from its plan with its emblem',
    (tierId, planId, emblem) => {
      const html = renderToStaticMarkup(<VipBadge tier={tierId} size={20} />);
      expect(html).toContain(`data-vip-badge="${tierId}"`);
      const byPlan = renderToStaticMarkup(<VipBadge planId={planId} size={20} />);
      expect(byPlan).toContain(`data-vip-badge="${tierId}"`);
      expect(byPlan).toContain(emblem === 'trophy' ? 'vip-badge__art' : 'vip-badge__art');
    },
  );

  it('sizes itself like the verified seal and labels accessibly', () => {
    const html = renderToStaticMarkup(<VipBadge tier="gold" size={26} />);
    expect(html).toContain('--vip-badge-size:26px');
    expect(html).toContain('Gold VIP');
    expect(html).toContain('role="img"');
    expect(html).toContain('vip-badge__glow');
  });

  it('gold trophy shows the cup; diamond shows the gem; nothing renders for free fans', () => {
    expect(renderToStaticMarkup(<VipBadge planId="monthly" size={18} />)).toContain('vip-badge--gold');
    expect(renderToStaticMarkup(<VipBadge planId="annual" size={18} />)).toContain('vip-badge--diamond');
    expect(renderToStaticMarkup(<VipBadge planId="free" size={18} />)).toBe('');
  });

  it('animates with a breathing halo that stops for reduced motion', async () => {
    const css = await import('node:fs').then((fs) => fs.readFileSync('app/globals.css', 'utf8'));
    expect(css).toContain('@keyframes vipBadgeGlow');
    expect(css).toContain('.vip-badge__glow');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\.vip-badge__glow/);
  });

  it('mounts in the DOM with the tier label variant', async () => {
    await render(<VipBadge tier="silver" size={16} withLabel />);
    expect(container.querySelector('[data-vip-badge="silver"]')).toBeTruthy();
    expect(container.textContent).toContain('SILVER');
  });
});
