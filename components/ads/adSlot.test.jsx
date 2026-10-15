/**
 * AdSlot SSR safety tests: the server render must be a deterministic, empty
 * container — third-party scripts only ever run client-side, inside isolated
 * frames (see lib/adsConfig for the exact code each frame executes).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdSlot from './AdSlot';
import { BANNER_728x90, BANNER_300x250 } from '@/lib/adsConfig';

describe('AdSlot', () => {
  it('server-renders a stable, script-free banner container', () => {
    const html = renderToStaticMarkup(<AdSlot variant="banner" banner={BANNER_728x90} />);
    expect(html).toContain('data-ad-slot="banner-728x90"');
    // No third-party code and no frame before mount → hydration cannot mismatch.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('czernik.org');
    // Space is reserved so the ad cannot cause a layout shift.
    expect(html).toContain('width:728px');
    expect(html).toContain('height:90px');
  });

  it('pins every slot layer to a transparent, dark-scheme canvas — no white boxes', () => {
    const html = renderToStaticMarkup(<AdSlot variant="banner" banner={BANNER_728x90} />);
    // Each wrapper carries the ad-slot hook targeted by the global CSS
    // (background transparent + dark colour scheme)…
    expect((html.match(/ad-slot/g) || []).length).toBeGreaterThanOrEqual(2);
    // …and the dark/transparent treatment is also inline, so it holds even
    // before the stylesheet paints.
    expect((html.match(/background-color:transparent/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((html.match(/color-scheme:dark/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/background:\s*(white|#fff)/i);
    expect(html).not.toMatch(/background-color:\s*(white|#fff)/i);
  });

  it('renders two banners on one page without any shared global markup', () => {
    const html = renderToStaticMarkup(
      <div>
        <AdSlot variant="banner" banner={BANNER_728x90} />
        <AdSlot variant="banner" banner={BANNER_300x250} />
      </div>
    );
    expect(html).toContain('data-ad-slot="banner-728x90"');
    expect(html).toContain('data-ad-slot="banner-300x250"');
    expect(html).not.toContain('atOptions');
  });

  it('server-renders the native slot as an empty container too', () => {
    const html = renderToStaticMarkup(<AdSlot variant="native" />);
    expect(html).toContain('data-ad-slot="native-banner"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('container-44ce743f3b5a54566aace2ec1430ba23');
    // Native slots get the same transparent dark treatment as banners.
    expect(html).toContain('ad-slot');
    expect(html).toContain('background-color:transparent');
    expect(html).toContain('color-scheme:dark');
  });

  it('server-renders the social slot as a hidden hydration hook', () => {
    const html = renderToStaticMarkup(<AdSlot variant="social" />);
    expect(html).toContain('data-ad-slot="social-bar"');
    expect(html).not.toContain('<script');
  });
});
