import type { FeedEntry } from './types';

/** Stream tags are untrusted strings, not caller-supplied regexes. */
const ALIASES: string[][] = [
  ['manchester united', 'man united', 'man utd', 'mufc', 'مانشستر يونايتد'],
  ['manchester city', 'man city', 'mcfc', 'مانشستر سيتي'],
  ['paris saint germain', 'paris st germain', 'psg', 'باريس سان جيرمان'],
  ['barcelona', 'fc barcelona', 'barca', 'fcb', 'برشلونة'],
  ['real madrid', 'real madrid cf', 'rma', 'ريال مدريد'],
  ['atletico madrid', 'atletico de madrid', 'atl madrid'],
  ['tottenham hotspur', 'tottenham', 'spurs'],
  ['bayern munich', 'bayern munchen', 'bayern'],
  ['internazionale', 'internazionale milano', 'inter milan', 'inter'],
  ['borussia dortmund', 'dortmund', 'bvb'],
  ['juventus', 'juve'], ['sporting cp', 'sporting lisbon'],
  ['arsenal', 'arsenal fc', 'ars'], ['chelsea', 'chelsea fc', 'che'], ['liverpool', 'liverpool fc', 'liv'],
  ['raja ca', 'raja casablanca', 'raja club athletic', 'الرجاء الرياضي'],
  ['wydad ac', 'wydad casablanca', 'wac', 'الوداد الرياضي'],
];
const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'club', 'football']);
const fold = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const significant = (value: string) => fold(value).split(/\s+/).filter((word) => word && !STOP.has(word));

export function inferStreamQuality(...tags: Array<string | undefined>): 'FHD' | 'HD' | 'SD' | 'Auto' {
  // Callers pass the display title before weaker database/quality hints.
  // Numeric resolution wins over vague labels within one hint: "HD (360p)"
  // must not outrank a real 720p stream because its TVG id still ends in @HD.
  for (const text of tags) {
    if (!text) continue;
    if (/(?:\b|\dx)(?:1080|1440|2160)[pi]?\b/i.test(text)) return 'FHD';
    if (/(?:\b|\dx)720[pi]?\b/i.test(text)) return 'HD';
    if (/(?:\b|\dx)(?:240|288|360|432|480|540|576)[pi]?\b/i.test(text)) return 'SD';
    if (/\b(fhd|uhd|4k)\b/i.test(text)) return 'FHD';
    if (/\bhd\b/i.test(text)) return 'HD';
    if (/\bsd\b/i.test(text)) return 'SD';
  }
  return 'Auto';
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]));
      diagonal = previous;
    }
  }
  return row[b.length];
}
interface Evidence { score: number; start: number; end: number }
function evidence(team: string, words: string[]): Evidence[] {
  const tokens = significant(team);
  const canonical = tokens.join(' ');
  const aliases = ALIASES.find((group) => group.some((alias) => significant(alias).join(' ') === canonical)) ?? [canonical];
  const hits: Evidence[] = [];
  for (const alias of aliases) {
    const wanted = significant(alias);
    if (!wanted.length) continue;
    for (let i = 0; i <= words.length - wanted.length; i++) {
      if (wanted.length === 1 && wanted[0] === 'inter' && words[i + 1] === 'miami') continue;
      let score = 1;
      for (let j = 0; j < wanted.length; j++) {
        const a = wanted[j]; const b = words[i + j];
        if (a === b) continue;
        // Short tags (PSG, RMA, City, …) must be exact; fuzzy typos are only
        // allowed in long, distinctive words, never generic substring matches.
        if (Math.min(a.length, b.length) < 5) { score = 0; break; }
        score = Math.min(score, 1 - distance(a, b) / Math.max(a.length, b.length));
      }
      if (score >= 0.8) hits.push({ score, start: i, end: i + wanted.length });
    }
  }
  return hits;
}
function scope(value: string): string {
  const text = fold(value);
  const women = /\b(women|womens|ladies|femenino|femenina|feminin)\b/.test(text) ? 'women' : 'senior';
  const youth = /\b(?:u|under)\s?(\d{2})\b/.exec(text)?.[1] || '';
  const reserves = /\b(reserves|academy|b team)\b/.test(text) ? 'reserves' : '';
  return `${women}:${youth}:${reserves}`;
}

/** Both sides need distinct evidence. A single shared "Manchester" never maps a fixture. */
export function matchChannelScore(matchTitle: string, channel: Pick<FeedEntry, 'name' | 'tvgId' | 'group' | 'tags' | 'matchTitle'>, homeTeam?: string, awayTeam?: string): number {
  if (!homeTeam || !awayTeam) {
    const parts = matchTitle.split(/\s+(?:vs?\.?|versus|x|[-–—])\s+/i);
    if (parts.length < 2) return 0;
    [homeTeam, awayTeam] = parts;
  }
  if (!homeTeam?.trim() || !awayTeam?.trim()) return 0;
  const text = [channel.name, channel.matchTitle, channel.tvgId, channel.group, ...(channel.tags ?? [])].filter(Boolean).join(' ').slice(0, 1600);
  if (scope(`${homeTeam} ${awayTeam}`) !== scope(text)) return 0;
  const words = significant(text);
  let best = 0;
  for (const home of evidence(homeTeam, words)) {
    for (const away of evidence(awayTeam, words)) {
      if (home.end <= away.start || away.end <= home.start) best = Math.max(best, (home.score + away.score) / 2);
    }
  }
  return best >= 0.85 ? best : 0;
}
