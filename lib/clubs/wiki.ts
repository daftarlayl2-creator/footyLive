/**
 * Club facts from Wikipedia + Wikidata (both keyless public APIs):
 *
 *  - Wikipedia search (`action=query&list=search`) finds the club article,
 *    the REST summary endpoint gives the bio extract + Wikidata item id.
 *  - Wikidata claims give the founding year (P571), home venue (P115) and the
 *    *current* head coach (P286 statement without an end date).
 *
 * Parsers are pure and unit-tested; fetchers cache for a day.
 */
import { fetchJson } from '@/lib/providers/http';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const FACTS_REVALIDATE_S = 86_400;

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  description?: string;
  thumbnail?: string;
  wikidataId?: string;
}

export interface WikidataFacts {
  founded?: number;
  stadium?: string;
  manager?: string;
  /** ISO date the current manager was appointed (when recorded). */
  managerSince?: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure parsers                                                               */
/* -------------------------------------------------------------------------- */

const REJECT_TITLE =
  /\b(in international football|season|seasons|list of|history of|academy|women|ladies|féminin|femenino|reserves|youth|under-\d{2}|u-?\d{2}|stadium|arena|supporters|ultras|records and statistics|players|managers|derby|rivalry)\b/i;
const FOOTBALL_HINT = /football|soccer|futbol|fútbol/i;

function fold(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Best club article title from a Wikipedia search response. */
export function pickWikipediaTitle(searchJson: any, clubName: string): string | null {
  const hits: any[] = Array.isArray(searchJson?.query?.search) ? searchJson.query.search : [];
  const firstWord = fold(clubName).split(/[^a-z0-9]+/).find((w) => w.length > 2) ?? '';
  let fallback: string | null = null;
  for (const hit of hits) {
    const title = String(hit?.title ?? '');
    if (!title || REJECT_TITLE.test(title)) continue;
    const snippet = String(hit?.snippet ?? '').replace(/<[^>]+>/g, '');
    const relevant = !firstWord || fold(title).includes(firstWord) || fold(snippet).includes(firstWord);
    if (FOOTBALL_HINT.test(snippet) && relevant) return title;
    if (!fallback && relevant && /\b(F\.?C\.?|C\.?F\.?|A\.?C\.?|S\.?C\.?|club)\b/i.test(title)) fallback = title;
  }
  return fallback;
}

/** REST summary → bio (null for disambiguation pages or empty extracts). */
export function parseWikipediaSummary(json: any): WikiSummary | null {
  if (!json || json.type === 'disambiguation') return null;
  const extract = String(json.extract ?? '').trim();
  const title = String(json.title ?? '').trim();
  if (!extract || !title) return null;
  const url = json.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const thumbnail = json.originalimage?.source || json.thumbnail?.source;
  return {
    title,
    extract,
    url: String(url),
    ...(json.description ? { description: String(json.description) } : {}),
    ...(thumbnail ? { thumbnail: String(thumbnail) } : {}),
    ...(json.wikibase_item ? { wikidataId: String(json.wikibase_item) } : {}),
  };
}

function qualifierTime(statement: any, property: string): string | null {
  const time = statement?.qualifiers?.[property]?.[0]?.datavalue?.value?.time;
  return typeof time === 'string' ? time : null;
}

/** "+1886-12-01T00:00:00Z" → Date.parse-able "1886-12-01T00:00:00Z" (null when imprecise). */
function wikidataTimeToIso(time: string | null): string | null {
  if (!time) return null;
  const cleaned = time.replace(/^\+/, '').replace(/-00/g, '-01');
  return Number.isFinite(Date.parse(cleaned)) ? cleaned : null;
}

/**
 * The statement that is true *now*: not deprecated, no end date (P582) in the
 * past; `preferred` rank wins, then the latest start date (P580).
 */
export function pickCurrentStatement(statements: any[] | undefined, now: Date = new Date()): any | null {
  const candidates = (Array.isArray(statements) ? statements : []).filter((st) => {
    if (st?.rank === 'deprecated' || st?.mainsnak?.snaktype !== 'value') return false;
    const end = wikidataTimeToIso(qualifierTime(st, 'P582'));
    if (qualifierTime(st, 'P582') && (!end || Date.parse(end) <= now.getTime())) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const start = (st: any) => {
    const iso = wikidataTimeToIso(qualifierTime(st, 'P580'));
    return iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY;
  };
  candidates.sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred') || start(b) - start(a));
  return candidates[0];
}

export function statementEntityId(statement: any): string | null {
  const id = statement?.mainsnak?.datavalue?.value?.id;
  return typeof id === 'string' && /^Q\d+$/.test(id) ? id : null;
}

export function statementYear(statement: any): number | null {
  const time = statement?.mainsnak?.datavalue?.value?.time;
  const year = typeof time === 'string' ? Number.parseInt(/^[+-]?(\d{1,4})/.exec(time)?.[1] ?? '', 10) : NaN;
  return Number.isFinite(year) && year > 1000 ? year : null;
}

export function statementStartIso(statement: any): string | null {
  return wikidataTimeToIso(qualifierTime(statement, 'P580'));
}

/* -------------------------------------------------------------------------- */
/*  Fetchers                                                                   */
/* -------------------------------------------------------------------------- */

export async function findWikipediaTitle(name: string, options: { national?: boolean } = {}): Promise<string | null> {
  const query = options.national ? `${name} national football team` : `${name} football club`;
  const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&srprop=snippet&format=json&origin=*`;
  return pickWikipediaTitle(await fetchJson(url, { revalidate: FACTS_REVALIDATE_S }), name);
}

export async function getWikipediaSummary(title: string): Promise<WikiSummary | null> {
  const url = `${WIKI_REST}/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`;
  return parseWikipediaSummary(await fetchJson(url, { revalidate: FACTS_REVALIDATE_S }));
}

async function getClaims(entity: string, property: string): Promise<any[]> {
  const url = `${WIKIDATA_API}?action=wbgetclaims&entity=${entity}&property=${property}&format=json&origin=*`;
  const json = await fetchJson(url, { revalidate: FACTS_REVALIDATE_S });
  return Array.isArray(json?.claims?.[property]) ? json.claims[property] : [];
}

async function getLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json&origin=*`;
  const json = await fetchJson(url, { revalidate: FACTS_REVALIDATE_S });
  const labels: Record<string, string> = {};
  for (const id of ids) {
    const label = json?.entities?.[id]?.labels?.en?.value;
    if (label) labels[id] = String(label);
  }
  return labels;
}

export async function getWikidataFacts(qid: string): Promise<WikidataFacts> {
  if (!/^Q\d+$/.test(qid)) return {};
  const [inception, venues, coaches] = await Promise.allSettled([
    getClaims(qid, 'P571'),
    getClaims(qid, 'P115'),
    getClaims(qid, 'P286'),
  ]);
  const founded = inception.status === 'fulfilled' ? statementYear(pickCurrentStatement(inception.value) ?? inception.value[0]) : null;
  const venue = venues.status === 'fulfilled' ? pickCurrentStatement(venues.value) : null;
  const coach = coaches.status === 'fulfilled' ? pickCurrentStatement(coaches.value) : null;

  const venueId = statementEntityId(venue);
  const coachId = statementEntityId(coach);
  const labels = await getLabels([venueId, coachId].filter((id): id is string => Boolean(id))).catch(
    () => ({}) as Record<string, string>
  );
  const managerSince = coach ? statementStartIso(coach) : null;

  return {
    ...(founded ? { founded } : {}),
    ...(venueId && labels[venueId] ? { stadium: labels[venueId] } : {}),
    ...(coachId && labels[coachId] ? { manager: labels[coachId] } : {}),
    ...(coachId && labels[coachId] && managerSince ? { managerSince } : {}),
  };
}
