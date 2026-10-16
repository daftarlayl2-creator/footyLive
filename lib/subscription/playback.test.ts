import { describe, expect, it } from 'vitest';
import { buildProxyUrl, limitPlaylistResolution, ResolutionLimitError, rewritePlaylist, verifyProxySignature } from '@/lib/hlsProxy';
import type { Channel } from '@/lib/types';
import { FREE_ACCESS, subscriptionAccess } from './plans';
import { preparePlayback } from './playback';

const now = Date.now();
const vip = subscriptionAccess([{ id: '1', planId: 'monthly', startsAt: now - 1000, expiresAt: now + 100_000 }], 'espn-1', now);
const source = (quality = 'HD'): Channel => ({ name: `Sports ${quality}`, quality, url: buildProxyUrl(`https://cdn.example.com/${quality}.m3u8`), provider: 'livefeed' });
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:RESOLUTION=1280x720,BANDWIDTH=1000000,AUDIO="a"\nhd.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\nfhd.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=3840x2160\n4k.m3u8\n';

describe('premium playback boundary', () => {
  it('filters premium servers for free fans and signs every HD link with its ceiling', () => {
    const prepared = preparePlayback([source(), source('FHD'), source('4K')], FREE_ACCESS, now);
    expect(prepared.streams).toHaveLength(1); expect(prepared.lockedCount).toBe(2);
    expect(preparePlayback([{ ...source('Auto'), name: 'Sports (1080p)' }], FREE_ACCESS, now).lockedCount).toBe(1);
    const params = new URL(prepared.defaultUrl!, 'https://eviv.live').searchParams;
    expect(params.get('maxHeight')).toBe('720');
    expect(verifyProxySignature(params.get('url')!, '', Number(params.get('exp')), params.get('sig')!, 720)).toBe(true);
    expect(verifyProxySignature(params.get('url')!, '', Number(params.get('exp')), params.get('sig')!)).toBe(false);
    expect(verifyProxySignature(params.get('url')!, '', Number(params.get('exp')), params.get('sig')!, 2160)).toBe(false);
  });
  it('unlocks real FHD/4K and bounds link life by the paid entitlement expiry', () => {
    const prepared = preparePlayback([source('FHD'), source('4K')], vip, now);
    expect(prepared.streams).toHaveLength(2);
    const params = new URL(prepared.defaultUrl!, 'https://eviv.live').searchParams;
    expect(params.get('maxHeight')).toBe('2160');
    expect(Number(params.get('exp'))).toBe(vip.expiresAt);
  });
  it('never serializes an uncontrolled ad-bearing embed for an ad-free fan', () => {
    const embed = { name: 'External player', url: '/api/stream-redirect?u=example', kind: 'embed' as const };
    expect(preparePlayback([embed, source()], vip, now).streams).toHaveLength(1);
    expect(preparePlayback([embed], FREE_ACCESS, now).streams).toHaveLength(1);
  });
  it('drops confirmed-offline and forged sources without granting another visitor VIP from a shared resolver', () => {
    const sources = [source(), { ...source(), url: '/api/proxy?url=https://evil.example&exp=1&sig=fake' }, { ...source('FHD'), health: { status: 'offline' as const, latencyMs: null, checkedAt: now, successRate: 0, samples: 1 } }];
    expect(preparePlayback(sources, vip, now).streams).toHaveLength(1);
    const vipUrl = preparePlayback([source('FHD')], vip, now).defaultUrl;
    expect(preparePlayback([source('FHD')], FREE_ACCESS, now).defaultUrl).toBeNull();
    expect(vipUrl).not.toBeNull();
  });
  it('removes FHD/4K variants before signing, including iframe and alternate-video bypasses', () => {
    const raw = master + '#EXT-X-I-FRAME-STREAM-INF:RESOLUTION=1920x1080,URI="iframe.m3u8"\n#EXT-X-MEDIA:TYPE=VIDEO,URI="angle.m3u8"\n';
    const text = rewritePlaylist(raw, 'https://cdn.example.com/master.m3u8', { maxHeight: 720, expiresAt: now + 1000 });
    expect(text).toContain('RESOLUTION=1280x720');
    for (const forbidden of ['fhd.m3u8', '4k.m3u8', 'iframe.m3u8', 'angle.m3u8']) expect(text).not.toContain(forbidden);
    expect(text).toContain('audio.m3u8');
    for (const link of text.match(/\/api\/proxy\?[^"\s]+/g) || []) {
      const params = new URL(link, 'https://eviv.live').searchParams;
      expect(params.get('maxHeight')).toBe('720'); expect(Number(params.get('exp'))).toBe(now + 1000);
    }
    expect(limitPlaylistResolution(master, 2160)).toContain('4k.m3u8');
  });
  it('does not silently serve an unlabelled premium master or an empty variant list', () => {
    expect(() => limitPlaylistResolution('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000\nunknown.m3u8', 720)).toThrow(ResolutionLimitError);
    expect(() => limitPlaylistResolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nfhd.m3u8', 720)).toThrow(ResolutionLimitError);
    const unknown = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000\nunknown.m3u8';
    expect(limitPlaylistResolution(unknown, 2160)).toContain('unknown.m3u8');
    const audioOnly = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"\naudio.m3u8';
    expect(() => limitPlaylistResolution(audioOnly, 720)).toThrow(ResolutionLimitError);
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts';
    expect(limitPlaylistResolution(media, 720)).toBe(media);
  });
});
