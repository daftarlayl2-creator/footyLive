/**
 * Highlights provider tests: highlights now come from YouTube's public RSS
 * feeds. The provider must request the long-form (no-Shorts) playlist feeds
 * with browser headers and a hard deadline, fall back to the plain channel
 * feed, parse real feed XML into the Highlight shape, filter out non-highlight
 * uploads, and degrade to an empty list on any failure instead of hanging.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async () => null,
    set: async () => {},
    // The provider's resilience is under test here, not the cache internals.
    swr: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  }),
}));

import {
  getHighlights,
  HIGHLIGHTS_CHANNELS,
  HIGHLIGHTS_TIMEOUT_MS,
  cleanMatchTitle,
  extractCompetition,
  parseFeed,
  splitTeams,
  withTimeout,
} from './highlights';

const PREMIER_LEAGUE = HIGHLIGHTS_CHANNELS[0];
const LALIGA = HIGHLIGHTS_CHANNELS[1];

function entryXml(opts: {
  videoId: string;
  title: string;
  published: string;
  channelName?: string;
  channelId?: string;
  views?: number;
}) {
  const channelName = opts.channelName ?? 'Premier League';
  const channelId = opts.channelId ?? PREMIER_LEAGUE.id;
  const views = opts.views ?? 643480;
  return `
    <entry>
      <id>yt:video:${opts.videoId}</id>
      <yt:videoId>${opts.videoId}</yt:videoId>
      <yt:channelId>${channelId}</yt:channelId>
      <title>${opts.title}</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=${opts.videoId}"/>
      <author>
        <name>${channelName}</name>
        <uri>https://www.youtube.com/channel/${channelId}</uri>
      </author>
      <published>${opts.published}</published>
      <updated>${opts.published}</updated>
      <media:group>
        <media:title>${opts.title}</media:title>
        <media:content url="https://www.youtube.com/v/${opts.videoId}?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
        <media:thumbnail url="https://i3.ytimg.com/vi/${opts.videoId}/hqdefault.jpg" width="480" height="360"/>
        <media:description>All the goals &amp; best moments from the match.</media:description>
        <media:community>
          <media:starRating count="1896" average="4.93" min="1" max="5"/>
          <media:statistics views="${views}"/>
        </media:community>
      </media:group>
    </entry>`;
}

function feedXml(entries: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="https://www.youtube.com/feeds/videos.xml?channel_id=${PREMIER_LEAGUE.id}"/>
 <id>yt:channel:${PREMIER_LEAGUE.id}</id>
 <yt:channelId>${PREMIER_LEAGUE.id}</yt:channelId>
 <title>Premier League</title>
 ${entries.join('\n')}
</feed>`;
}

/** Fetch stub that answers the UULF long-form feeds with `feedsByChannel`. */
function youTubeFeedStub(feedsByChannel: Record<string, string>, calls: Array<{ url: string; init: any }> = []) {
  return vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const match = String(url).match(/playlist_id=UULF([\w-]+)/) || String(url).match(/channel_id=([\w-]+)/);
    const channelId = match ? `UC${match[1]}` : '';
    const body = feedsByChannel[channelId];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200 });
  });
}

describe('getHighlights', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the long-form YouTube feeds with browser headers and an abort signal', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal(
      'fetch',
      youTubeFeedStub(
        {
          [PREMIER_LEAGUE.id]: feedXml([
            entryXml({
              videoId: 'abc123',
              title: 'Arsenal 2-1 Liverpool | Premier League Highlights',
              published: '2026-10-15T12:00:00+00:00',
            }),
          ]),
        },
        calls
      )
    );

    const list = await getHighlights();
    expect(list).toHaveLength(1);
    expect(calls.length).toBeGreaterThan(0);
    // Every request goes to the keyless YouTube RSS endpoint…
    for (const call of calls) {
      expect(String(call.url)).toContain('https://www.youtube.com/feeds/videos.xml');
    }
    // …prefers the long-form (no Shorts) playlist flavour…
    expect(calls.some((c) => String(c.url).includes(`playlist_id=UULF${PREMIER_LEAGUE.id.slice(2)}`))).toBe(true);
    // …and carries browser headers plus a hard deadline.
    expect(calls[0].init.headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
    expect(calls[0].init.headers['Accept']).toContain('xml');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('parses video id, title, match teams, competition, high-res thumbnail, date and views', async () => {
    vi.stubGlobal(
      'fetch',
      youTubeFeedStub({
        [PREMIER_LEAGUE.id]: feedXml([
          entryXml({
            videoId: 'abc123',
            title: 'EXTENDED HIGHLIGHTS | Arsenal 2-1 Liverpool | Premier League 26/27',
            published: '2026-10-15T12:00:00+00:00',
            views: 1234567,
          }),
          entryXml({
            videoId: 'int456',
            title: 'Press conference with Mikel Arteta',
            published: '2026-10-15T13:00:00+00:00',
          }),
        ]),
      })
    );

    const list = await getHighlights();
    // Non-highlight uploads (interviews, pressers) never reach the grid.
    expect(list).toHaveLength(1);
    const h = list[0];
    expect(h).toMatchObject({
      id: 'yt-abc123',
      videoId: 'abc123',
      title: 'EXTENDED HIGHLIGHTS | Arsenal 2-1 Liverpool | Premier League 26/27',
      matchTitle: 'Arsenal 2-1 Liverpool',
      homeTeam: 'Arsenal',
      awayTeam: 'Liverpool',
      competition: 'Premier League',
      channel: 'Premier League',
      views: 1234567,
      url: 'https://www.youtube.com/watch?v=abc123',
      thumbnail: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      date: '2026-10-15T12:00:00+00:00',
    });
    expect(h.thumbnailUrl).toBe(h.thumbnail);
    expect(h.embed).toContain('https://www.youtube.com/embed/abc123?rel=0&modestbranding=1');
    expect(h.videos[0]).toMatchObject({ id: 'abc123', url: 'https://www.youtube.com/watch?v=abc123' });
    expect(h.channelUrl).toBe(`https://www.youtube.com/channel/${PREMIER_LEAGUE.id}`);
    expect(h.description).toContain('All the goals & best moments');
  });

  it('merges channels, de-duplicates and sorts newest first', async () => {
    vi.stubGlobal(
      'fetch',
      youTubeFeedStub({
        [PREMIER_LEAGUE.id]: feedXml([
          entryXml({ videoId: 'old1', title: 'Arsenal vs Chelsea highlights', published: '2026-10-10T12:00:00+00:00' }),
          entryXml({ videoId: 'shared', title: 'EVERY Weekend Goal | Matchweek 6', published: '2026-10-12T12:00:00+00:00' }),
        ]),
        [LALIGA.id]: feedXml([
          entryXml({
            videoId: 'new1',
            title: 'Resumen de Real Madrid 3-0 Sevilla | LaLiga EA Sports',
            published: '2026-10-14T12:00:00+00:00',
            channelName: 'LALIGA',
            channelId: LALIGA.id,
          }),
          // Same video id also reported by a second channel → must not repeat.
          entryXml({ videoId: 'shared', title: 'Every goal of the weekend', published: '2026-10-12T12:00:00+00:00' }),
        ]),
      })
    );

    const list = await getHighlights();
    expect(list.map((h) => h.videoId)).toEqual(['new1', 'shared', 'old1']);
    expect(list[0]).toMatchObject({ competition: 'LaLiga', channel: 'LALIGA', homeTeam: 'Real Madrid', awayTeam: 'Sevilla' });
  });

  it('falls back to the plain channel feed when the long-form playlist feed fails', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const stub = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      if (String(url).includes('playlist_id=UULF')) return new Response('gone', { status: 404 });
      return new Response(
        feedXml([entryXml({ videoId: 'fb1', title: 'MATCH HIGHLIGHTS: Inter 3-0 Napoli | Serie A', published: '2026-10-15T10:00:00+00:00' })]),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', stub);

    const list = await getHighlights();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ videoId: 'fb1', homeTeam: 'Inter', awayTeam: 'Napoli', competition: 'Serie A' });
    // The fallback really is the official channel_id feed.
    expect(calls.some((c) => String(c.url).includes(`channel_id=${PREMIER_LEAGUE.id}`))).toBe(true);
  });

  it('degrades to an empty list when every upstream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(getHighlights()).resolves.toEqual([]);
  });

  it('degrades to an empty list on network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(getHighlights()).resolves.toEqual([]);
  });

  it('gives up after the 3-second deadline even when the upstream hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never settles

    const pending = getHighlights();
    await vi.advanceTimersByTimeAsync(HIGHLIGHTS_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([]);
    vi.useRealTimers();
  });
});

describe('parseFeed', () => {
  it('returns an empty list for documents without entries', () => {
    expect(parseFeed('<?xml version="1.0"?><feed></feed>', PREMIER_LEAGUE)).toEqual([]);
    expect(parseFeed('', PREMIER_LEAGUE)).toEqual([]);
  });

  it('decodes XML entities and CDATA text in titles', () => {
    const xml = feedXml([
      entryXml({ videoId: 'e1', title: '<![CDATA[Arsenal & Tottenham goals]]>', published: '2026-10-15T12:00:00+00:00' }),
      entryXml({ videoId: 'e2', title: 'Man City 1-0 Man &#39;Utd&#39; highlights', published: '2026-10-15T12:00:00+00:00' }),
    ]);
    const list = parseFeed(xml, PREMIER_LEAGUE);
    expect(list.map((h) => h.title)).toEqual(['Arsenal & Tottenham goals', "Man City 1-0 Man 'Utd' highlights"]);
  });
});

describe('cleanMatchTitle / splitTeams', () => {
  it('strips labels, pipe segments and hashtags but never team names', () => {
    expect(cleanMatchTitle('EXTENDED HIGHLIGHTS | Arsenal 2-1 Liverpool | Premier League 26/27')).toBe('Arsenal 2-1 Liverpool');
    expect(cleanMatchTitle('HIGHLIGHTS: Arsenal vs Liverpool')).toBe('Arsenal vs Liverpool');
    expect(cleanMatchTitle('Arsenal vs Liverpool - Extended Highlights')).toBe('Arsenal vs Liverpool');
    // A dash followed by non-label text is part of the title, not a suffix.
    expect(cleanMatchTitle('Real Madrid - Barcelona')).toBe('Real Madrid - Barcelona');
    expect(cleanMatchTitle('TOP 10 goals #shorts #premierleague')).toBe('TOP 10 goals');
  });

  it('splits teams on whole words, spaced dashes and mid-title scorelines', () => {
    expect(splitTeams('Arsenal vs Liverpool')).toEqual({ home: 'Arsenal', away: 'Liverpool' });
    expect(splitTeams('Paris Saint-Germain v Marseille')).toEqual({ home: 'Paris Saint-Germain', away: 'Marseille' });
    expect(splitTeams('Real Madrid - Barcelona')).toEqual({ home: 'Real Madrid', away: 'Barcelona' });
    expect(splitTeams('Inter 3-0 Napoli')).toEqual({ home: 'Inter', away: 'Napoli' });
    expect(splitTeams('Single Name')).toEqual({ home: 'Single Name', away: '' });
  });

  it('never treats a kick-off time as a scoreline separator', () => {
    // "18:00" is a time, not an 18-0 score: no split happens on the colon…
    expect(splitTeams('Arsenal 18:00 Liverpool')).toEqual({ home: 'Arsenal 18:00 Liverpool', away: '' });
    // …while real separators around a time still work.
    expect(splitTeams('Arsenal vs Liverpool 18:00')).toEqual({ home: 'Arsenal', away: 'Liverpool 18:00' });
    // Hyphenated scorelines keep splitting.
    expect(splitTeams('Arsenal 2-1 Liverpool')).toEqual({ home: 'Arsenal', away: 'Liverpool' });
    // A segment is recognised as a fixture via its scoreline, not its time.
    expect(cleanMatchTitle('Highlights | Kick-off 18:00 show | Arsenal 2-1 Liverpool')).toBe('Arsenal 2-1 Liverpool');
  });

  it('recognises competitions from the title and falls back to the channel label', () => {
    expect(extractCompetition('Man City 2-2 Real Madrid | UEFA Champions League', 'UEFA')).toBe('UEFA Champions League');
    expect(extractCompetition('Resumen: Girona 1-1 Getafe', 'LaLiga')).toBe('LaLiga');
    expect(extractCompetition('Derby day madness!', 'Sky Sports Football')).toBe('Sky Sports Football');
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useRealTimers());

  it('passes through fast results', async () => {
    await expect(withTimeout(Promise.resolve([1]), 1000, [])).resolves.toEqual([1]);
  });

  it('falls back on timeout and on rejection', async () => {
    vi.useFakeTimers();
    const hanging = withTimeout(new Promise<number[]>(() => {}), 500, [7]);
    await vi.advanceTimersByTimeAsync(500);
    await expect(hanging).resolves.toEqual([7]);
    vi.useRealTimers();

    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, [9])).resolves.toEqual([9]);
  });
});
