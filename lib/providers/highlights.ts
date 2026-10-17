import { getCacheManager } from '../cache/cacheManager';

/**
 * YouTube-powered highlights provider.
 *
 * The old ScoreBat feed started returning empty payloads, so highlights now
 * come straight from YouTube's public, keyless RSS feeds for a curated set of
 * football channels (the big-five leagues, UEFA and two major football
 * broadcasters). Each feed answers with the channel's 15 most recent uploads;
 * we keep the videos that look like match highlights / goal compilations,
 * merge every channel, de-duplicate and sort by publish date.
 *
 * Why RSS and not the Data API: no API key, no quota, one ~60 KB XML document
 * per channel, and YouTube refreshes the feeds within minutes of an upload.
 */

export interface HighlightVideo {
  id: string;
  title: string;
  embed: string;
  url?: string;
}

export interface Highlight {
  id: string;
  title: string;
  matchTitle?: string;
  thumbnailUrl?: string;
  embedCode?: string;
  url?: string;
  competition: string;
  date: string;
  thumbnail: string;
  homeTeam: string;
  awayTeam: string;
  videos: HighlightVideo[];
  embed: string;
  /** YouTube video id — the native in-page player embeds from this. */
  videoId: string;
  /** Display name of the uploading channel (e.g. "Premier League"). */
  channel: string;
  /** Link to the uploading channel. */
  channelUrl?: string;
  /** View count, when YouTube reports it in the feed. */
  views?: number;
  /** Short excerpt of the video description. */
  description?: string;
}

interface ChannelConfig {
  id: string;
  name: string;
  /** Fallback competition label, used when the title names no competition. */
  competition: string;
}

/**
 * Curated football channels. IDs are the public `UC…` channel identifiers —
 * every one of them feeds `youtube.com/feeds/videos.xml?channel_id=…`.
 */
export const HIGHLIGHTS_CHANNELS: ChannelConfig[] = [
  { id: 'UCG5qGWdu8nIRZqJ_GgDwQ-w', name: 'Premier League', competition: 'Premier League' },
  { id: 'UCTv-XvfzLX3i4IGWAm4sbmA', name: 'LALIGA', competition: 'LaLiga' },
  { id: 'UCBJeMCIeLQos7wacox4hmLQ', name: 'Serie A', competition: 'Serie A' },
  { id: 'UC6UL29enLNe4mqwTfAyeNuw', name: 'Bundesliga', competition: 'Bundesliga' },
  { id: 'UCQsH5XtIc9hONE1BQjucM0g', name: 'Ligue 1', competition: 'Ligue 1' },
  { id: 'UCyGa1YEx9ST66rYrJTGIKOw', name: 'UEFA', competition: 'UEFA' },
  { id: 'UCZ7wY7MRDSygp63HIEfdQZA', name: 'Sky Sports Football', competition: 'Sky Sports Football' },
  { id: 'UCET00YnetHT7tOpu12v8jxg', name: 'CBS Sports Golazo', competition: 'CBS Sports Golazo' },
];

/** Hard deadline for the whole provider call (mirrors the client timeout). */
export const HIGHLIGHTS_TIMEOUT_MS = 3_000;

/** Per-feed deadline. Channels are fetched in parallel, so this only bounds
 *  a single slow feed (plus its fallback) rather than the whole provider. */
const FEED_TIMEOUT_MS = 2_000;

const CACHE_KEY = 'youtube_highlights';
const CACHE_TTL_SECONDS = 15 * 60;
const MAX_HIGHLIGHTS = 36;
const DESCRIPTION_LIMIT = 220;

/** YouTube serves RSS fine to any client, but a browser UA avoids bot walls. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Titles that look like match highlights or goal compilations (multilingual:
 *  English, Spanish, Italian, French, German — the languages our curated
 *  channels upload in). Word boundaries keep "goalkeeper" out. */
const HIGHLIGHT_TITLE_RE =
  /\bhighlights?\b|\bgoals?\b|\bgoles\b|\bgol\b|\btore\b|\bbuts\b|resum[eé]n|resum[eé]s?|zusammenfassung|riassunto|sintesi/i;

/**
 * Competition labels extracted from video titles, most specific first.
 * Anything unmatched falls back to the channel's own label.
 */
const COMPETITION_PATTERNS: Array<[RegExp, string]> = [
  [/champions\s?league|\bucl\b/i, 'UEFA Champions League'],
  [/europa\s?league|\buel\b/i, 'UEFA Europa League'],
  [/conference\s?league|\buecl\b/i, 'UEFA Conference League'],
  [/premier\s?league|\bepl\b/i, 'Premier League'],
  [/bundesliga/i, 'Bundesliga'],
  [/la\s?liga|laliga/i, 'LaLiga'],
  [/serie\s?a\b/i, 'Serie A'],
  [/ligue\s*1\b/i, 'Ligue 1'],
  [/\bfa\s?cup\b/i, 'FA Cup'],
  [/carabao\s?cup|league\s?cup/i, 'Carabao Cup'],
  [/copa\s?del\s?rey/i, 'Copa del Rey'],
  [/nations\s?league/i, 'UEFA Nations League'],
  [/world\s?cup/i, 'FIFA World Cup'],
  [/\beuro\s?\d{2,4}\b|european\s?championship/i, 'UEFA EURO'],
  [/copa\s?am[eé]rica/i, 'Copa América'],
  [/copa\s?libertadores/i, 'Copa Libertadores'],
  [/\bmls\b|major\s?league\s?soccer/i, 'MLS'],
  [/eredivisie/i, 'Eredivisie'],
  [/saudi\s?pro\s?league/i, 'Saudi Pro League'],
];

export function extractCompetition(title: string, fallback: string): string {
  const t = String(title || '');
  for (const [pattern, label] of COMPETITION_PATTERNS) {
    if (pattern.test(t)) return label;
  }
  return fallback;
}

/** Decode the handful of XML entities YouTube puts into RSS text. */
export function decodeXmlEntities(text: string): string {
  return String(text || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const code = parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  let raw = match[1].trim();
  if (raw.startsWith('<![CDATA[') && raw.endsWith(']]>')) {
    raw = raw.slice(9, -3);
  }
  return decodeXmlEntities(raw);
}

function extractAttr(block: string, tag: string, attr: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`));
  return match ? decodeXmlEntities(match[1]) : '';
}

/** Does this text segment look like a fixture ("A vs B", "A 2-1 B")?
 *  Scoreline separators are hyphens/en-dashes only — a colon is a kick-off
 *  time ("18:00"), never a score. */
const MATCH_SEGMENT_RE = /\s+(?:vs\.?|v|x)\s+|\s+\d+\s*[-–]\s*\d+\s+/i;

/** Leading label words channels put in front of the fixture. */
const LEADING_LABEL_RE =
  /^\s*(?:(?:extended|full|match|official)\s+)*(?:highlights?|resumen|resume|zusammenfassung|riassunto|sintesi|goals?)\s*(?:de(?:l|la|las|los)?\s+)?(?:[:\-–—]\s*)?/i;

/**
 * Reduce a raw video title to the match it covers:
 *  "EXTENDED HIGHLIGHTS | Arsenal 2-1 Liverpool | Premier League 26/27"
 *    → "Arsenal 2-1 Liverpool"
 * Pipe segments are scanned for the one that names the fixture; label
 * suffixes and leading labels are dropped only when they are clearly labels,
 * never team names ("Paris Saint-Germain" survives).
 */
export function cleanMatchTitle(rawTitle: string): string {
  let title = decodeXmlEntities(rawTitle);
  // Pipe segments are "fixture | competition | playlist label" in any order —
  // keep the segment that actually looks like a fixture, or the first one.
  const segments = title.split('|').map((s) => s.trim()).filter(Boolean);
  title = segments.find((s) => MATCH_SEGMENT_RE.test(s)) ?? segments[0] ?? '';
  // Drop a trailing " - EXTENDED HIGHLIGHTS" style segment, but only when the
  // segment itself is highlight label text (never a team name).
  title = title.replace(/\s+[-–—]\s+[^-–—]*$/i, (suffix) =>
    HIGHLIGHT_TITLE_RE.test(suffix) ? '' : suffix
  );
  // Drop a leading "HIGHLIGHTS:" / "Resumen de" label.
  title = title.replace(LEADING_LABEL_RE, '');
  // Hashtags ("#shorts", "#premierleague") carry no match info.
  title = title.replace(/#\w+/g, ' ');
  return title.replace(/\s{2,}/g, ' ').trim();
}

export function splitTeams(title: string): { home: string; away: string } {
  // Whole-word separators only ("vs", "v", "x"), spaced dashes — never letters
  // inside names ("Arsenal" must not split on its "s") and never hyphens inside
  // names ("Paris Saint-Germain" stays intact) — plus a mid-title scoreline
  // ("Arsenal 2-1 Liverpool"). Colons are excluded: "18:00" is a kick-off
  // time, not an 18-0 score.
  const vsSplit = String(title || '').split(/\s+(?:vs\.?|v|x)\s+|\s+[-–—]\s+|\s+\d+\s*[-–]\s*\d+\s+/i);
  if (vsSplit.length >= 2) {
    // First two segments are the teams; anything after is a date/round suffix.
    return { home: vsSplit[0].trim(), away: vsSplit[1].trim() };
  }
  return { home: title || '', away: '' };
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Clean YouTube iframe embed (unbranded) — also kept for API consumers. */
export function youtubeEmbedHtml(videoId: string): string {
  return (
    `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1" ` +
    'title="YouTube video player" frameborder="0" ' +
    'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
    'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'
  );
}

function parseTimestamp(iso: string): number {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
}

function trimDescription(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > DESCRIPTION_LIMIT ? `${t.slice(0, DESCRIPTION_LIMIT - 1)}…` : t;
}

/**
 * Parse one YouTube RSS document (channel or playlist flavour — the entry
 * format is identical) into Highlight records. Non-highlight uploads
 * (interviews, press conferences, features) are filtered out.
 */
export function parseFeed(xml: string, channel: ChannelConfig): Highlight[] {
  const out: Highlight[] = [];
  const blocks = String(xml || '').split('<entry').slice(1);
  for (const block of blocks) {
    const videoId =
      extractTag(block, 'yt:videoId') || (block.match(/yt:video:([\w-]+)/)?.[1] ?? '');
    if (!videoId) continue;

    const title = extractTag(block, 'title') || 'Match Highlights';
    if (!HIGHLIGHT_TITLE_RE.test(title)) continue;

    const date = extractTag(block, 'published');
    const channelName = extractTag(block, 'name') || channel.name;
    const views = Number.parseInt(extractAttr(block, 'media:statistics', 'views'), 10);
    const matchTitle = cleanMatchTitle(title);
    const { home, away } = splitTeams(matchTitle);
    const embed = youtubeEmbedHtml(videoId);
    const watchUrl = youtubeWatchUrl(videoId);
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

    out.push({
      id: `yt-${videoId}`,
      title,
      matchTitle,
      competition: extractCompetition(title, channel.competition),
      date,
      thumbnail,
      thumbnailUrl: thumbnail,
      homeTeam: home,
      awayTeam: away,
      videos: [{ id: videoId, title, embed, url: watchUrl }],
      embed,
      embedCode: embed,
      url: watchUrl,
      videoId,
      channel: channelName,
      channelUrl: `https://www.youtube.com/channel/${channel.id}`,
      views: Number.isFinite(views) ? views : undefined,
      description: trimDescription(extractTag(block, 'media:description')),
    });
  }
  return out;
}

/**
 * Long-form uploads feed for a channel: the uploads playlist without Shorts
 * ("UULF" + the channel id minus its leading "UC"). Primary source, so the
 * grid never fills with 9:16 shorts.
 */
export function longFormFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`;
}

/** Official per-channel feed (includes Shorts) — used as the fallback. */
export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

async function fetchFeedText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchChannelHighlights(channel: ChannelConfig): Promise<Highlight[]> {
  // Primary: long-form playlist feed (no Shorts). Fallback: the channel's
  // plain feed when the playlist flavour is unavailable (e.g. YouTube changes
  // the UULF playlist scheme). An empty-but-valid parse is a real result.
  let xml: string;
  try {
    xml = await fetchFeedText(longFormFeedUrl(channel.id));
  } catch {
    xml = await fetchFeedText(channelFeedUrl(channel.id));
  }
  return parseFeed(xml, channel);
}

/** Merge every channel feed: newest first, de-duplicated, capped. */
async function fetchYouTubeHighlights(): Promise<Highlight[]> {
  const results = await Promise.allSettled(HIGHLIGHTS_CHANNELS.map(fetchChannelHighlights));
  const seen = new Set<string>();
  const all: Highlight[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const highlight of result.value) {
      if (seen.has(highlight.videoId)) continue;
      seen.add(highlight.videoId);
      all.push(highlight);
    }
  }
  all.sort((a, b) => parseTimestamp(b.date) - parseTimestamp(a.date));
  return all.slice(0, MAX_HIGHLIGHTS);
}

/**
 * Resolve `promise` within `ms`, falling back to `fallback` on timeout.
 * Late rejections are swallowed so they never become unhandled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
    promise.catch(() => {});
  }
}

/**
 * Recent highlights, always resolved within `HIGHLIGHTS_TIMEOUT_MS`. A slow or
 * failing upstream degrades to an empty list instead of hanging the request.
 */
export async function getHighlights(): Promise<Highlight[]> {
  const cache = getCacheManager();
  return withTimeout(
    cache.swr(CACHE_KEY, fetchYouTubeHighlights, CACHE_TTL_SECONDS),
    HIGHLIGHTS_TIMEOUT_MS,
    [] as Highlight[]
  );
}

export const fetchHighlights = getHighlights;
export const highlightsProvider = { get: getHighlights, fetchHighlights };

export default highlightsProvider;
