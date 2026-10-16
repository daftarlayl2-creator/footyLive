import { describe, expect, it } from 'vitest';
import { broadcasterMatchScore } from './broadcasters';
import { MENA_BEIN_IDS, isMenaBeinId, menaTargets, regionalMetadata } from './mena';
import { browsableChannels, channelIndex } from './pool';
import { rankLiveBackupCandidates } from './backups';
import { GUOVIN_IPTV_API_URL, IPTV_ORG_SPORTS_URL } from './sources';
import type { LiveChannel } from './types';

const channel = (id: string, feedUrl: string, tvgId = id): LiveChannel => ({ id, tvgId, feedUrl, source: new URL(feedUrl).hostname, name: 'beIN SPORTS 1', group: 'Sports', url: `https://cdn.example.com/${id}/index.m3u8` });

describe('hidden regional channel pool', () => {
  it('defines exactly beIN 1–8 Qatar MENA editions, without fuzzy regional aliases', () => {
    expect(MENA_BEIN_IDS).toHaveLength(8);
    expect(MENA_BEIN_IDS[0]).toBe('beINSports1.qa@MENA'); expect(MENA_BEIN_IDS[7]).toBe('beINSports8.qa@MENA');
    for (const id of ['beINSports1.fr@HD', 'beINSports1.qa', 'beINSports9.qa@MENA', 'beinsports1.qa@MENA']) expect(isMenaBeinId(id)).toBe(false);
    expect(regionalMetadata('beINSports1.qa@MENA')).toEqual({ tvgId: 'beINSports1.qa@MENA', language: 'ar', region: 'MENA' });
  });
  it('maps reported Arabic/numbered hints and Arabic digits without guessing rights from teams', () => {
    expect(menaTargets(['beIN SPORTS 1 Arabic', 'beIN SPORTS 8', 'بي إن سبورت ٣', 'beINSports4.qa@MENA'])).toEqual(['beINSports1.qa@MENA', 'beINSports8.qa@MENA', 'beINSports3.qa@MENA', 'beINSports4.qa@MENA']);
    expect(menaTargets(['Real Madrid vs Barcelona', 'La Liga', 'beIN SPORTS 1 France', 'beIN SPORTS 9'])).toEqual([]);
  });
  it('uses exact EPG ids ahead of labels and never labels a foreign edition as Arabic commentary', () => {
    expect(broadcasterMatchScore(['beINSports1.qa@MENA'], { name: 'Main feed', tvgId: MENA_BEIN_IDS[0] })).toBe(2);
    expect(broadcasterMatchScore(['beIN SPORTS 1 Arabic'], { name: 'beIN SPORTS 1', tvgId: 'beINSports1.fr@HD' })).toBe(0);
    expect(broadcasterMatchScore(['beIN SPORTS 1 Arabic'], { name: 'beIN SPORTS 1' })).toBe(0);
    expect(broadcasterMatchScore(['beINSports1.qa@MENA'], { name: 'beIN SPORTS 1', tvgId: MENA_BEIN_IDS[1] })).toBe(0);
  });
  it('indexes all regional mirrors by exact id and reuses the cached index', () => {
    const channels = [channel('1', IPTV_ORG_SPORTS_URL, MENA_BEIN_IDS[0]), channel('2', GUOVIN_IPTV_API_URL, MENA_BEIN_IDS[0])];
    expect(channelIndex(channels).get(MENA_BEIN_IDS[0])).toEqual(channels);
    expect(channelIndex(channels).get('beinsports1.qa@MENA')).toBeUndefined();
    expect(channelIndex(channels)).toBe(channelIndex(channels));
  });
  it('keeps official playlist channels out of navigation/catalogue while retaining event feeds', () => {
    const channels = [channel('1', IPTV_ORG_SPORTS_URL), channel('2', GUOVIN_IPTV_API_URL), channel('3', 'https://events.example/list.m3u')];
    expect(browsableChannels(channels)).toEqual([channels[2]]);
    expect(channelIndex(channels).size).toBe(3);
  });
  it('ranks the exact regional target as broadcaster evidence, not confirmed match coverage', () => {
    const wrong = channel('wrong', IPTV_ORG_SPORTS_URL, 'beINSports1.fr@HD');
    const right = channel('right', IPTV_ORG_SPORTS_URL, MENA_BEIN_IDS[0]);
    const selected = rankLiveBackupCandidates([wrong, right], { title: 'Team A vs Team B', broadcasters: ['beIN SPORTS 1 Arabic'] });
    expect(selected[0]).toMatchObject({ channel: { id: 'right' }, coverage: 'broadcaster', score: 2 });
    expect(selected[1].coverage).toBe('sports');
  });
});
