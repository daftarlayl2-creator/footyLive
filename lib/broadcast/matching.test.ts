import { describe, expect, it } from 'vitest';
import { inferStreamQuality, matchChannelScore } from './matching';
import { parseM3U } from './m3u';
import { parseJsonFeed } from './json';
import { attachStreamSources } from '@/lib/streamEngine';
import type { Match } from '@/lib/types';

const feed = 'https://feed.example.com/channels.m3u';

describe('fixture-to-IPTV mapping', () => {
  it.each([
    ['Manchester United vs Liverpool', 'LIV v Man Utd | FHD', 'Manchester United', 'Liverpool'],
    ['Paris Saint-Germain vs Manchester City', 'Man City – PSG [1080p]', 'Paris Saint-Germain', 'Manchester City'],
    ['Barcelona vs Real Madrid', 'Barça vs. RMA HD', 'Barcelona', 'Real Madrid'],
    ['Atlético Madrid vs Chelsea', 'Chelsea x Atletico de Madrid FHD', 'Atlético Madrid', 'Chelsea'],
    ['Arsenal vs Chelsea', 'Arsenall versus Chelseaa | HD', 'Arsenal', 'Chelsea'],
    ['Barcelona vs Real Madrid', 'برشلونة ضد ريال مدريد', 'Barcelona', 'Real Madrid'],
  ])('maps %s onto reversed, aliased or slightly misspelled tags', (title, name, home, away) => {
    expect(matchChannelScore(title, { name }, home, away)).toBeGreaterThanOrEqual(0.85);
  });

  it('uses tvg-name, tvg-id and JSON stream tags without requiring the visible channel name to name the fixture', () => {
    const [m3u] = parseM3U('#EXTM3U\n#EXTINF:-1 tvg-id="mufc.liv.fhd" tvg-name="Man Utd vs Liverpool",Sports 1\nhttps://cdn.example.com/a.m3u8', feed);
    expect(matchChannelScore('Manchester United vs Liverpool', m3u)).toBe(1);
    const [json] = parseJsonFeed(JSON.stringify([{ name: 'Sports HD', tags: ['Barca', 'RMA'], url: 'https://cdn.example.com/b.m3u8' }]), feed);
    expect(matchChannelScore('Barcelona vs Real Madrid', json)).toBe(1);
  });

  it('retains the parent fixture and quality when a nested JSON stream is called only FHD', () => {
    const [stream] = parseJsonFeed(JSON.stringify({ matches: [{ name: 'Barcelona vs Real Madrid', streams: [{ name: 'Main FHD', quality: 'FHD', url: 'https://cdn.example.com/match.m3u8' }] }] }), feed);
    expect(stream.name).toBe('Main FHD');
    expect(stream.quality).toBe('FHD');
    expect(matchChannelScore('Barcelona vs Real Madrid', stream)).toBe(1);
  });

  it('supports structured home/away metadata as well as an event title', () => {
    const [stream] = parseJsonFeed(JSON.stringify([{ name: 'Sports 2', home_team: { name: 'Arsenal' }, awayTeam: 'Liverpool', stream_url: 'https://cdn.example.com/x.m3u8' }]), feed);
    expect(matchChannelScore('Arsenal vs Liverpool', stream)).toBe(1);
  });

  it.each([
    ['Manchester United vs Manchester City', 'Manchester United FHD'],
    ['Manchester United vs Liverpool', 'Manchester City vs Everton'],
    ['Real Madrid vs Atletico Madrid', 'Real Madrid vs Roma'],
    ['Inter vs Juventus', 'Inter Miami vs Juventus'],
    ['Arsenal vs Chelsea', 'Arsenal Women vs Chelsea Women'],
    ['Arsenal vs Chelsea', 'Arsenal U21 vs Chelsea U21'],
    ['Arsenal vs Chelsea', 'Sports 1 FHD'],
    ['Arsenal vs Chelsea', 'Arsenal vs Tottenham'],
  ])('does not infer %s from an ambiguous or different fixture', (title, name) => {
    expect(matchChannelScore(title, { name })).toBe(0);
  });

  it('does not evaluate arbitrary regex metacharacters from fixture names', () => {
    expect(() => matchChannelScore('(a+)+ vs [broken', { name: 'Sports 1' })).not.toThrow();
    expect(matchChannelScore('(a+)+ vs [broken', { name: 'Sports 1' })).toBe(0);
  });

  it('keeps same-city catalogue matches from attaching an unrelated stream', () => {
    const fixture = { title: 'Manchester United vs Liverpool', homeTeam: { name: 'Manchester United' }, awayTeam: { name: 'Liverpool' }, sources: [] } as unknown as Match;
    const wrong = { ...fixture, homeTeam: { name: 'Manchester City', badge: '' }, awayTeam: { name: 'Everton', badge: '' }, sources: [{ source: 'wf', id: 'wrong', url: 'https://cdn.example.com/wrong.m3u8', label: 'Wrong' }] };
    expect(attachStreamSources([fixture], [wrong])[0].sources).toEqual([]);
  });

  it('infers FHD, HD and SD only when tags actually provide a quality', () => {
    expect(inferStreamQuality('Match', 'FHD')).toBe('FHD');
    expect(inferStreamQuality('Sports 1080p')).toBe('FHD');
    expect(inferStreamQuality('Sports UHD 4K')).toBe('4K');
    expect(inferStreamQuality('Sports 3840x2160')).toBe('4K');
    expect(inferStreamQuality('Sports 720p')).toBe('HD');
    expect(inferStreamQuality('Sports SD')).toBe('SD');
    expect(inferStreamQuality('Sports')).toBe('Auto');
    expect(inferStreamQuality('ESPN 2 HD (360p)', 'FHD', 'ESPN2.nl@HD')).toBe('SD');
    expect(inferStreamQuality('ESPN (432p)', 'ESPN.us@HD')).toBe('SD');
    expect(inferStreamQuality('5Plus (1080p)', '5Plus.il@SD')).toBe('FHD');
    expect(inferStreamQuality('Sports (1280x720)', 'SD')).toBe('HD');
  });
});
