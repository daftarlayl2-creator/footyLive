/** Broadcaster hints are candidate evidence, never proof of fixture coverage. */
import type { FeedEntry } from './types';
import { isMenaBeinId, menaTargets } from './mena';

/** Preserve the actual TV/streaming names ESPN supplies; never guess league rights. */
export function fixtureBroadcasters(competition: any): string[] {
  const names: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const name = value.replace(/\s+/g, ' ').trim();
    if (name && name.length <= 120 && !names.some((item) => item.toLowerCase() === name.toLowerCase()) && names.length < 24) names.push(name);
  };
  for (const broadcast of Array.isArray(competition?.broadcasts) ? competition.broadcasts : []) {
    if (/radio|audio/i.test(`${broadcast?.type?.shortName || ''} ${broadcast?.type?.name || ''}`)) continue;
    for (const name of Array.isArray(broadcast?.names) ? broadcast.names : []) add(name);
  }
  for (const broadcast of Array.isArray(competition?.geoBroadcasts) ? competition.geoBroadcasts : []) {
    if (/radio|audio/i.test(`${broadcast?.type?.shortName || ''} ${broadcast?.type?.name || ''}`)) continue;
    add(broadcast?.media?.shortName || broadcast?.media?.name || broadcast?.media?.callLetters);
  }
  return names;
}

function fold(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:\d{3,4}[pi]|[fush]hd|hd|sd|4k)\b/g, ' ')
    .replace(/[^a-z0-9+\u0600-\u06ff]+/g, ' ').trim();
}

const NETWORKS = [
  ['bein', /\bbe\s*in(?:\s*sports?)?|بي\s*إن\s*سبورتس/],
  ['espn', /\bespn(?=$|[\s\d+]|deportes|premium|extra|plus|u\b)/],
  ['canal', /\bcanal\s*(?:\+|plus)/],
  ['sky', /\bsky\s*sports?/],
  ['fox', /\bfox\s*sports?|\bfs(?=[12]\b)/],
  ['tnt', /\btnt\s*sports?/],
  ['dazn', /\bdazn\b/],
  ['supersport', /\bsuper\s*sport/],
  ['premier', /\bpremier\s*sports?/],
  ['tsn', /\btsn(?=$|[\s\d])/],
] as const;

function networkDescriptor(value: string) {
  const text = fold(value);
  for (const [brand, regex] of NETWORKS) {
    const found = regex.exec(text);
    if (!found) continue;
    const rest = text.slice(found.index + found[0].length).trim();
    const number = /^(?:sports?\s*)?(\d{1,2})(?=$|[^\d])/.exec(rest)?.[1] || '';
    // Do not equate ESPN+ with ESPN, ESPN Deportes with ESPN Premium, or
    // beIN XTRA with a numbered subscription network. All remain fallbacks.
    const edition = brand === 'espn' && (/^\+|^plus\b/.test(rest)) ? 'plus'
      : brand === 'espn' && /^u(?:\s|$)/.test(rest) ? 'u'
      : /\b(?:xtra|extra|deportes|premium|connect|news|golf|tennis|f1|main event|premier league)\b/.exec(rest)?.[0]
        || (brand === 'canal' && /^sports?/.test(rest) ? 'sport' : '');
    return { brand, number, edition };
  }
  return null;
}

/** Regex/alias matching, with explicit channel numbers and editions respected. */
export function broadcasterMatchScore(broadcasters: string[], channel: Pick<FeedEntry, 'name' | 'tvgId' | 'tags'>): number {
  const targets = menaTargets(broadcasters);
  if (targets.length && channel.tvgId) {
    if (targets.includes(channel.tvgId) && isMenaBeinId(channel.tvgId)) return 2;
    // An exact regional id is authoritative even if the label says "beIN Sports 1".
    if (/^beINSports\d+\./i.test(channel.tvgId)) return 0;
  }
  if (targets.length && broadcasters.some((hint) => /@MENA|arabic|عربي/i.test(hint)) &&
      /be\s*in|بي\s*[إا]?ن/i.test([channel.name, ...(channel.tags || [])].join(' '))) return 0;
  // Human-readable title is authoritative; a tvg-id is a useful secondary hint.
  const primary = networkDescriptor(channel.name);
  const candidates = primary ? [primary] : [channel.tvgId?.replace(/\.[a-z]{2,3}(?:@.*)?$/i, ''), ...(channel.tags ?? [])]
    .filter((value): value is string => !!value).map(networkDescriptor).filter((value) => value !== null);
  let best = 0;
  for (const name of broadcasters) {
    const target = networkDescriptor(name);
    if (!target) continue;
    for (const candidate of candidates) {
      if (candidate.brand !== target.brand || candidate.edition !== target.edition) continue;
      if (target.number && candidate.number !== target.number) continue;
      best = Math.max(best, target.number === candidate.number ? 1 : 0.75);
    }
  }
  return best;
}
