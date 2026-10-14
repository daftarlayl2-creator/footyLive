import { describe, it, expect } from 'vitest';
import {
  buildProxyUrl,
  verifyProxySignature,
  rewritePlaylist,
  parseSafeUpstreamUrl,
  isDirectStreamUrl,
  isPlaylistUrl,
  isPlaylistContentType,
  guessContentType,
  PROXY_PATH,
} from './hlsProxy';

function parseProxyLink(link: string) {
  expect(link.startsWith(`${PROXY_PATH}?`)).toBe(true);
  const params = new URLSearchParams(link.slice(PROXY_PATH.length + 1));
  return {
    url: params.get('url')!,
    ref: params.get('ref') || '',
    exp: Number(params.get('exp')),
    sig: params.get('sig')!,
  };
}

describe('Proxy link signing', () => {
  it('produces a relative, verifiable link', () => {
    const link = buildProxyUrl('https://cdn.example.com/live/index.m3u8', { referer: 'https://embed.example.com/' });
    const { url, ref, exp, sig } = parseProxyLink(link);
    expect(url).toBe('https://cdn.example.com/live/index.m3u8');
    expect(ref).toBe('https://embed.example.com/');
    expect(exp).toBeGreaterThan(Date.now());
    expect(verifyProxySignature(url, ref, exp, sig)).toBe(true);
  });

  it('rejects tampered URL, referer, expiry or signature', () => {
    const { url, ref, exp, sig } = parseProxyLink(buildProxyUrl('https://cdn.example.com/a.ts'));
    expect(verifyProxySignature('https://evil.example.com/a.ts', ref, exp, sig)).toBe(false);
    expect(verifyProxySignature(url, 'https://evil.example.com/', exp, sig)).toBe(false);
    expect(verifyProxySignature(url, ref, exp + 1, sig)).toBe(false);
    expect(verifyProxySignature(url, ref, exp, sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')))).toBe(false);
    expect(verifyProxySignature(url, ref, NaN, sig)).toBe(false);
    expect(verifyProxySignature(url, ref, exp, '')).toBe(false);
  });

  it('keeps ".m3u8" visible in the link so the player detects HLS', () => {
    const link = buildProxyUrl('https://cdn.example.com/live/index.m3u8');
    expect(link).toContain('.m3u8');
  });
});

describe('URL classification', () => {
  it('detects direct stream URLs', () => {
    expect(isDirectStreamUrl('https://x.com/live/index.m3u8?token=1')).toBe(true);
    expect(isDirectStreamUrl('https://x.com/hls/123/')).toBe(true);
    expect(isDirectStreamUrl('https://x.com/video.mp4')).toBe(true);
    expect(isDirectStreamUrl('https://x.com/embed/match-1')).toBe(false);
    expect(isDirectStreamUrl('')).toBe(false);
  });

  it('detects playlist URLs and content types', () => {
    expect(isPlaylistUrl('https://x.com/a/b/index.m3u8?x=1')).toBe(true);
    expect(isPlaylistUrl('https://x.com/a/b/seg1.ts')).toBe(false);
    expect(isPlaylistContentType('application/vnd.apple.mpegurl')).toBe(true);
    expect(isPlaylistContentType('application/x-mpegURL; charset=utf-8')).toBe(true);
    expect(isPlaylistContentType('video/mp2t')).toBe(false);
    expect(isPlaylistContentType(null)).toBe(false);
  });

  it('guesses sensible content types', () => {
    expect(guessContentType('https://x.com/a.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(guessContentType('https://x.com/a.ts?x=1')).toBe('video/mp2t');
    expect(guessContentType('https://x.com/init.m4s')).toBe('video/mp4');
    expect(guessContentType('https://x.com/sub.vtt')).toBe('text/vtt');
    expect(guessContentType('https://x.com/whatever')).toBeNull();
  });
});

describe('SSRF guard', () => {
  it('allows public http(s) hosts only', () => {
    expect(parseSafeUpstreamUrl('https://cdn.example.com/x.m3u8')).not.toBeNull();
    expect(parseSafeUpstreamUrl('http://cdn.example.com/x.m3u8')).not.toBeNull();
    expect(parseSafeUpstreamUrl('ftp://cdn.example.com/x')).toBeNull();
    expect(parseSafeUpstreamUrl('file:///etc/passwd')).toBeNull();
    expect(parseSafeUpstreamUrl('not a url')).toBeNull();
    expect(parseSafeUpstreamUrl('https://user:pw@cdn.example.com/x')).toBeNull();
  });

  it('blocks loopback, private and link-local ranges', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.0.1', '172.31.255.255', '169.254.169.254', '[::1]', 'foo.internal']) {
      expect(parseSafeUpstreamUrl(`http://${host}/x.m3u8`), host).toBeNull();
    }
    expect(parseSafeUpstreamUrl('http://172.32.0.1/x.m3u8')).not.toBeNull();
  });
});

describe('Playlist rewriting', () => {
  const base = 'https://cdn.example.com/live/720p/index.m3u8?token=abc';

  it('rewrites relative and absolute segment URIs to proxy links, preserving tags', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:100',
      '#EXTINF:6.000,',
      'seg100.ts',
      '#EXTINF:6.000,',
      '/other/path/seg101.ts?x=1',
      '#EXTINF:6.000,',
      'https://edge2.example.com/seg102.ts',
      '',
    ].join('\n');

    const out = rewritePlaylist(input, base);
    const lines = out.split('\n');

    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[4]).toBe('#EXTINF:6.000,');
    expect(parseProxyLink(lines[5]).url).toBe('https://cdn.example.com/live/720p/seg100.ts');
    expect(parseProxyLink(lines[7]).url).toBe('https://cdn.example.com/other/path/seg101.ts?x=1');
    expect(parseProxyLink(lines[9]).url).toBe('https://edge2.example.com/seg102.ts');
    expect(lines[10]).toBe('');

    // Every generated link must verify.
    for (const l of [lines[5], lines[7], lines[9]]) {
      const { url, ref, exp, sig } = parseProxyLink(l);
      expect(verifyProxySignature(url, ref, exp, sig)).toBe(true);
    }
  });

  it('rewrites master playlist variants and #EXT-X-MEDIA / I-FRAME URIs', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframes.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,AUDIO="aud"',
      '720p/index.m3u8',
    ].join('\n');

    const out = rewritePlaylist(input, 'https://cdn.example.com/live/master.m3u8');
    const lines = out.split('\n');

    const media = /URI="([^"]+)"/.exec(lines[1])![1];
    expect(parseProxyLink(media).url).toBe('https://cdn.example.com/live/audio/en.m3u8');
    expect(lines[1].startsWith('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",DEFAULT=YES,URI="')).toBe(true);

    const iframe = /URI="([^"]+)"/.exec(lines[2])![1];
    expect(parseProxyLink(iframe).url).toBe('https://cdn.example.com/live/iframes.m3u8');

    expect(lines[3]).toBe('#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,AUDIO="aud"');
    expect(parseProxyLink(lines[4]).url).toBe('https://cdn.example.com/live/720p/index.m3u8');
  });

  it('rewrites AES-128 key and fMP4 init-segment URIs', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/k1.key",IV=0x0123456789abcdef0123456789abcdef',
      '#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"',
      '#EXTINF:4.0,',
      'seg1.m4s',
    ].join('\n');

    const out = rewritePlaylist(input, base);
    const lines = out.split('\n');

    const key = /URI="([^"]+)"/.exec(lines[1])![1];
    expect(parseProxyLink(key).url).toBe('https://keys.example.com/k1.key');
    expect(lines[1]).toMatch(/,IV=0x0123456789abcdef0123456789abcdef$/);

    const map = /URI="([^"]+)"/.exec(lines[2])![1];
    expect(parseProxyLink(map).url).toBe('https://cdn.example.com/live/720p/init.mp4');
    expect(lines[2]).toMatch(/,BYTERANGE="720@0"$/);
  });

  it('leaves data:/skd: URIs and METHOD=NONE keys untouched', () => {
    const input = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=NONE',
      '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://abc"',
      '#EXT-X-SESSION-DATA:DATA-ID="x",URI="data:text/plain,hi"',
    ].join('\n');
    expect(rewritePlaylist(input, base)).toBe(input);
  });

  it('carries the referer through to generated links', () => {
    const out = rewritePlaylist('#EXTM3U\n#EXTINF:1,\nseg.ts', base, { referer: 'https://embed.example.com/' });
    const link = out.split('\n')[2];
    expect(parseProxyLink(link).ref).toBe('https://embed.example.com/');
  });

  it('handles CRLF line endings', () => {
    const out = rewritePlaylist('#EXTM3U\r\n#EXTINF:1,\r\nseg.ts\r\n', base);
    const lines = out.split('\n');
    expect(lines[0]).toBe('#EXTM3U');
    expect(parseProxyLink(lines[2]).url).toBe('https://cdn.example.com/live/720p/seg.ts');
  });
});
