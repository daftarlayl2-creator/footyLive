/**
 * Adsterra configuration integrity tests — the ad keys, sizes and script URLs
 * are copy-pasted from the Adsterra dashboard and must never drift.
 */
import { describe, expect, it } from 'vitest';
import {
  BANNER_300x250,
  BANNER_320x50,
  BANNER_728x90,
  NATIVE_BANNER,
  SOCIAL_BAR,
  bannerAtOptionsScript,
  bannerFrameHtml,
  bannerInvokeScript,
  nativeBannerFrameHtml,
} from './adsConfig.js';

describe('Adsterra ad definitions', () => {
  it('pins the social bar script URL', () => {
    expect(SOCIAL_BAR.src).toBe('https://czernik.org/14/283b6d90f1b8eeadb1b8dda2d0849761');
  });

  it('pins the native banner script URL and container id', () => {
    expect(NATIVE_BANNER.src).toBe('https://czernik.org/21/44ce743f3b5a54566aace2ec1430ba23');
    expect(NATIVE_BANNER.containerId).toBe('container-44ce743f3b5a54566aace2ec1430ba23');
  });

  it('pins every banner key, size and script URL', () => {
    expect(BANNER_728x90).toMatchObject({
      key: 'a2c14b4291560308f915ce8a1b17c971',
      src: 'https://czernik.org/22/a2c14b4291560308f915ce8a1b17c971',
      format: 'iframe',
      width: 728,
      height: 90,
    });
    expect(BANNER_300x250).toMatchObject({
      key: 'a47aaccbd50d51243882c1ce3818575d',
      src: 'https://czernik.org/22/a47aaccbd50d51243882c1ce3818575d',
      format: 'iframe',
      width: 300,
      height: 250,
    });
    expect(BANNER_320x50).toMatchObject({
      key: '32b55c2af4a907dab8cad75ae1fcfa3d',
      src: 'https://czernik.org/22/32b55c2af4a907dab8cad75ae1fcfa3d',
      format: 'iframe',
      width: 320,
      height: 50,
    });
  });

  it('uses unique atOptions keys per banner so concurrent renders cannot collide', () => {
    const keys = [BANNER_728x90.key, BANNER_300x250.key, BANNER_320x50.key];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('exact Adsterra code blocks', () => {
  it('rebuilds the banner atOptions block verbatim', () => {
    const script = bannerAtOptionsScript(BANNER_728x90);
    expect(script).toContain("atOptions = {");
    expect(script).toContain("'key' : 'a2c14b4291560308f915ce8a1b17c971'");
    expect(script).toContain("'format' : 'iframe'");
    expect(script).toContain("'height' : 90");
    expect(script).toContain("'width' : 728");
    expect(script).toContain("'params' : {}");
    expect(script).toContain('<script type="text/javascript">');
  });

  it('rebuilds the banner invoke script verbatim', () => {
    expect(bannerInvokeScript(BANNER_300x250)).toBe(
      '<script type="text/javascript" src="https://czernik.org/22/a47aaccbd50d51243882c1ce3818575d"></script>'
    );
  });

  it('runs each banner in its own frame document with its own atOptions', () => {
    const a = bannerFrameHtml(BANNER_728x90);
    const b = bannerFrameHtml(BANNER_320x50);
    expect(a).toContain("atOptions = {");
    expect(a).toContain(BANNER_728x90.src);
    expect(b).toContain("'key' : '32b55c2af4a907dab8cad75ae1fcfa3d'");
    // Different keys per frame document: no shared global to collide over.
    expect(a).not.toContain(BANNER_320x50.key);
  });

  it('rebuilds the native banner block verbatim (script + container div)', () => {
    const html = nativeBannerFrameHtml();
    expect(html).toContain(
      '<script async="async" data-cfasync="false" src="https://czernik.org/21/44ce743f3b5a54566aace2ec1430ba23"></script>'
    );
    expect(html).toContain('<div id="container-44ce743f3b5a54566aace2ec1430ba23"></div>');
  });
});
