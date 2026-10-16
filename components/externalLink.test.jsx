import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ExternalLink, { probeExternal, safeExternalUrl } from '@/components/ui/ExternalLink';

describe('safe external links', () => {
  it('only publishes well-formed public https URLs', () => {
    expect(safeExternalUrl('https://streamed.pk/docs/streams')).toBe('https://streamed.pk/docs/streams');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('http://user:pass@evil.example/x')).toBeNull();
    expect(safeExternalUrl('//evil.example')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });

  it('renders anchor markup with safe rel/target for valid URLs and degrades invalid ones to a labelled span', () => {
    const ok = renderToStaticMarkup(<ExternalLink href="https://watchfooty.st/en/docs">Docs</ExternalLink>);
    expect(ok).toContain('href="https://watchfooty.st/en/docs"');
    expect(ok).toContain('rel="noopener noreferrer"');
    expect(ok).toContain('target="_blank"');
    expect(ok).toContain('data-external-link="ok"');
    const bad = renderToStaticMarkup(<ExternalLink href="javascript:alert(1)">Docs</ExternalLink>);
    expect(bad).not.toContain('<a');
    expect(bad).toContain('data-external-link="invalid"');
    expect(bad).toContain('Docs');
  });

  it('probes the destination first so dead hosts fail closed instead of a broken tab', async () => {
    const okFetch = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', okFetch);
    await expect(probeExternal('https://cdnlivetv.ru/')).resolves.toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('dns')));
    await expect(probeExternal('https://gone.example')).resolves.toBe(false);
    vi.unstubAllGlobals();
  });
});
