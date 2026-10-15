import { describe, it, expect } from 'vitest';
import {
  EMBED_IFRAME_ALLOW,
  classifyEmbedStatus,
  classifyFrameLocation,
  embedCheckUrl,
  readFrameHref,
  stripIframeSandbox,
} from './embed';

const ORIGIN = 'https://eviv.example';

describe('EMBED_IFRAME_ALLOW', () => {
  it('grants what provider players need and contains no sandbox tokens', () => {
    expect(EMBED_IFRAME_ALLOW).toBe('autoplay; encrypted-media; picture-in-picture; fullscreen');
    expect(EMBED_IFRAME_ALLOW).not.toMatch(/sandbox|allow-/);
  });
});

describe('classifyFrameLocation', () => {
  it('treats an unreadable (cross-origin) location as a loaded provider page', () => {
    expect(classifyFrameLocation(null, ORIGIN)).toBe('loaded');
    expect(classifyFrameLocation(undefined, ORIGIN)).toBe('loaded');
    expect(classifyFrameLocation('https://provider.example/embed/1', ORIGIN)).toBe('loaded');
  });

  it('detects the initial blank document', () => {
    expect(classifyFrameLocation('about:blank', ORIGIN)).toBe('blank');
    expect(classifyFrameLocation('', ORIGIN)).toBe('blank');
  });

  it('flags our own redirect endpoint answering instead of redirecting', () => {
    expect(classifyFrameLocation(`${ORIGIN}/api/stream-redirect?u=x&expires=1&sig=y`, ORIGIN)).toBe('refused');
    expect(classifyFrameLocation('/api/stream-redirect?u=x', ORIGIN)).toBe('refused');
  });

  it('does not flag other same-origin pages', () => {
    expect(classifyFrameLocation(`${ORIGIN}/channel/abc`, ORIGIN)).toBe('loaded');
  });
});

describe('readFrameHref', () => {
  it('returns the href when readable and null when access throws', () => {
    expect(readFrameHref({ contentWindow: { location: { href: 'about:blank' } } })).toBe('about:blank');
    const crossOrigin = {
      get contentWindow(): { location: { href: string } } {
        throw new Error('SecurityError');
      },
    };
    expect(readFrameHref(crossOrigin)).toBeNull();
    expect(readFrameHref(null)).toBeNull();
  });
});

describe('embedCheckUrl', () => {
  it('only builds checks for our signed redirect links', () => {
    expect(embedCheckUrl('/api/stream-redirect?u=a&expires=1&sig=b')).toBe('/api/stream-redirect?u=a&expires=1&sig=b&check=1');
    expect(embedCheckUrl('https://provider.example/embed')).toBeNull();
    expect(embedCheckUrl('/api/proxy?url=x')).toBeNull();
    expect(embedCheckUrl(null)).toBeNull();
  });
});

describe('classifyEmbedStatus', () => {
  it('is conservative: only gone pages are offline', () => {
    expect(classifyEmbedStatus(200)).toBe('ok');
    expect(classifyEmbedStatus(302)).toBe('ok');
    expect(classifyEmbedStatus(404)).toBe('offline');
    expect(classifyEmbedStatus(410)).toBe('offline');
    for (const status of [401, 403, 429, 500, 503]) expect(classifyEmbedStatus(status)).toBe('unknown');
  });
});

describe('stripIframeSandbox', () => {
  it('removes every sandbox attribute form and adds the permissive allow list', () => {
    const html = [
      '<iframe src="https://a.example/1" sandbox="allow-scripts allow-same-origin"></iframe>',
      "<iframe sandbox='allow-scripts' src=\"https://b.example/2\"></iframe>",
      '<IFRAME SANDBOX src="https://c.example/3"></IFRAME>',
      '<iframe src="https://d.example/4" sandbox=allow-scripts></iframe>',
    ].join('');
    const out = stripIframeSandbox(html);
    expect(out).not.toMatch(/sandbox/i);
    expect(out.match(new RegExp(`allow="${EMBED_IFRAME_ALLOW}"`, 'g'))).toHaveLength(4);
    expect(out.match(/allowfullscreen/g)).toHaveLength(4);
    expect(out).toContain('src="https://b.example/2"');
  });

  it('keeps an existing allow attribute and leaves non-iframe markup alone', () => {
    const html = '<div data-sandbox="keep"><iframe allow="autoplay" allowfullscreen src="https://x.example"></iframe></div>';
    expect(stripIframeSandbox(html)).toBe(html);
    expect(stripIframeSandbox('')).toBe('');
    expect(stripIframeSandbox(null)).toBe('');
  });
});
