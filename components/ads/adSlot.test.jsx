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
  });

  it('server-renders the social slot as a hidden hydration hook', () => {
    const html = renderToStaticMarkup(<AdSlot variant="social" />);
    expect(html).toContain('data-ad-slot="social-bar"');
    expect(html).not.toContain('<script');
  });
});
