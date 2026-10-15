/**
 * Live-match backup mapping across EVERY configured playlist: the Live-events
 * index (and other custom event feeds), the official IPTV-Org sports category
 * and the Guovin IPTV-API playlist.
 *
 *  1. Rank — two-team listings first, then the fixture's reported broadcasters,
 *     then football channels, then general sports channels. Listings for a
 *     different sport (basketball, golf, fishing, 篮球, 垂钓, …), generator
 *     metadata and the built-in standby list never become match backups.
 *  2. Diversify — inside one evidence tier the pool is interleaved by feed
 *     family, so 400 IPTV-Org entries cannot starve the Guovin 体育 group (or
 *     the reverse) out of the probe window; near-duplicate editions of one
 *     channel wait their turn, and football-carrying networks (beIN, ESPN,
 *     CCTV-5, …) are woven in after every two football channels.
 *  3. Probe — a bounded window (twelve pinned best candidates plus a rotating
 *     slice) gets the strong media probe. A window that yields nothing rotates
 *     immediately: the next resolution explores fresh channels instead of
 *     re-failing on the same dead front-of-list entries.
 *  4. Gate — IPTV-Org and Guovin entries must be media-verified (a real segment
 *     was fetched). Event-feed entries keep their long-standing tolerance:
 *     blocked/slow (never offline) entries are offered as clearly-labelled
 *     unverified backups, at most three.
 *
 * Reachability is not fixture coverage: generic backups stay marked as possibly
 * showing a different fixture, and they rank behind match-specific servers.
 */
import crypto from 'crypto';
import logger from '../logger';
import { compareStreamHealth, freshHealth, HEALTH_REFRESH_MS, type StreamHealth } from '../player/health';
import { broadcasterMatchScore } from './broadcasters';
import { inferStreamQuality, matchChannelScore } from './matching';
import { getChannelHealth } from './probe';
import { isGuovinFeed, isIptvOrgFeed, isStandbyFeed } from './sources';
import type { LiveChannel } from './types';

export type BackupFamily = 'events' | 'iptv-org' | 'guovin' | 'standby';
export type BackupCoverage = 'fixture' | 'broadcaster' | 'sports';

export interface BackupFixture {
  title: string;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
  broadcasters?: string[];
}

export interface BackupCandidate {
  channel: LiveChannel;
  family: BackupFamily;
  coverage: BackupCoverage;
  /** Football relevance of the listing: 3 football channel, 2 football-carrying network, 1 general sports. */
  affinity: number;
  /** Two-team or broadcaster evidence score (0 for generic sports channels). */
  score: number;
}

export interface LiveBackup extends BackupCandidate {
  /** Fresh probe result; `undefined` when the probe was blocked or unavailable. */
  health?: StreamHealth;
  /** A media segment was fetched (strong probe), not merely a manifest header. */
  verified: boolean;
}

/** Most backups attached to one live fixture. */
export const MAX_LIVE_BACKUPS = 6;
/** Strong probes per resolution (pinned + rotating window). */
export const MAX_BACKUP_PROBES = 24;
const PINNED_PROBES = 12;
/** Unverified event-feed entries offered after the verified ones. */
export const MAX_UNVERIFIED_BACKUPS = 3;

const COVERAGE_ORDER: Record<BackupCoverage, number> = { fixture: 0, broadcaster: 1, sports: 2 };
const FAMILY_ORDER: Record<BackupFamily, number> = { events: 0, 'iptv-org': 1, guovin: 2, standby: 3 };
const QUALITY_ORDER = { FHD: 0, HD: 1, SD: 2, Auto: 3 } as const;
/** Families whose blocked/slow entries may still be offered as unverified backups. */
const TOLERATES_UNVERIFIED = new Set<BackupFamily>(['events']);

/* -------------------------------------------------------------------------- */
/*  Listing classification                                                    */
/* -------------------------------------------------------------------------- */

/** The sport itself, in the feeds' languages: strong evidence. */
const FOOTBALL_RE = /football|soccer|f[uú]tbol|futebol|calcio|fu(?:ß|ss)ball|voetbal|fotbal|futbal|футбол|كرة\s*القدم|足球|축구|サッカー|\bfoot\b|\bgol\s*tv\b/i;
/** Football competitions: weaker ("Premier League Darts", "Strongman Champions League"). */
const COMPETITION_RE = /la\s*liga|premier\s*league|serie\s*a\b|bundesliga|ligue\s*1|champions\s*league|europa\s*league|conference\s*league|\buefa\b|\bfifa\b|eredivisie|botola/i;
/** Networks whose general sports channels routinely carry football. */
const SPORTS_NETWORK_RE = /\b(?:be\s?in|espn|sky\s*sports?|dazn|tnt\s*sports?|bt\s*sport|eurosport|fox\s*sports?|super\s*sport|ssc|arena\s*sport|sport\s*tv|setanta|premier\s*sports?|movistar|canal\+?\s*sports?|rmc\s*sport|eleven\s*sports?|polsat\s*sport|tyc\s*sports|tudn|win\s*sports|ad\s*sports|abu\s*dhabi\s*sports|al\s*kass|alkass|ziggo\s*sport|viaplay|nova\s*sports?|digi\s*sport|sport\s*klub|match!?\s*(?:tv|arena|premier|futbol))\b|cctv-?5(?!\d)|五星体育|广东体育|纬来体育|劲爆体育|超级体育/i;
const SPORTS_RE = /sport|deport|esporte|спорт|رياض|体育|體育|运动|運動|스포츠|スポーツ/i;
/** Listings for a different sport cannot carry a football fixture. */
const OTHER_SPORT_RE = /basket|\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|hockey|cricket|\bipl\b|golf|tennis|racing|motor|\bf1\b|formula\s*1|nascar|\bwwe\b|\bufc\b|\bmma\b|boxing|kickbox|wrestl|strongman|horse|equestr|fishing|hunting|billiard|snooker|darts|poker|chess|bowling|篮球|籃球|垂钓|围棋|圍棋|广场舞|斗地主|台球|高尔夫|网球|赛车|拳击|棋牌/i;
/** A listing that explicitly names some other game. */
const OTHER_GAME_RE = /\s+(?:vs?\.?|versus|ضد)\s+/i;

export function backupFamily(feedUrl: string): BackupFamily {
  if (isIptvOrgFeed(feedUrl)) return 'iptv-org';
  if (isGuovinFeed(feedUrl)) return 'guovin';
  if (isStandbyFeed(feedUrl)) return 'standby';
  return 'events';
}

/**
 * How useful a listing is as a football backup (0 = never offered):
 * 3 a football channel/event, 2 a football-carrying sports network,
 * 1 a general sports listing (or an ungrouped event-feed entry).
 */
export function footballAffinity(channel: Pick<LiveChannel, 'name' | 'group' | 'tvgId' | 'tags'>, family: BackupFamily): number {
  if (family === 'standby') return 0;
  const name = [channel.name, channel.tvgId, ...(channel.tags ?? [])].filter(Boolean).join(' ');
  const group = channel.group || '';
  if (FOOTBALL_RE.test(name)) return 3;
  if (OTHER_SPORT_RE.test(name)) return 0;
  if (COMPETITION_RE.test(name)) return 3;
  if (SPORTS_NETWORK_RE.test(name)) return 2;
  if (FOOTBALL_RE.test(group)) return 3;
  if (OTHER_SPORT_RE.test(group)) return 0;
  // The IPTV-Org feed is the official *sports* category: every entry is sports.
  if (family === 'iptv-org' || SPORTS_RE.test(name) || SPORTS_RE.test(group)) return 1;
  // Event playlists often ship ungrouped match entries (legacy behaviour).
  return family === 'events' && !group ? 1 : 0;
}

const quality = (channel: LiveChannel) => inferStreamQuality(channel.name, channel.quality, channel.tvgId, ...(channel.tags ?? []));
/** IPTV-Org flags listings that rarely play from a server or are often off air. */
const restricted = (channel: LiveChannel) => Number(/\[(?:geo-?blocked|not\s*24\/7)\]/i.test(channel.name));

function compareCandidates(a: BackupCandidate & { index: number }, b: BackupCandidate & { index: number }): number {
  return COVERAGE_ORDER[a.coverage] - COVERAGE_ORDER[b.coverage] ||
    b.affinity - a.affinity ||
    restricted(a.channel) - restricted(b.channel) ||
    b.score - a.score ||
    FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family] ||
    QUALITY_ORDER[quality(a.channel)] - QUALITY_ORDER[quality(b.channel)] ||
    a.index - b.index;
}

/** Channel "brand" — the title without its quality/edition suffixes ("FIFA+ French (720p)" → "fifa+"). */
function brandKey(name: string): string {
  const folded = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[([].*$/, '').trim();
  return folded.split(/\s+/)[0] || folded;
}

/**
 * One evidence tier, diversified: round-robin by feed family (so no family
 * starves another out of the probe window), with at most two relays/editions
 * of the same channel brand before every other brand had its turn.
 */
function diversifyTier(tier: BackupCandidate[]): BackupCandidate[] {
  const buckets = new Map<BackupFamily, BackupCandidate[]>();
  for (const candidate of tier) {
    const bucket = buckets.get(candidate.family) ?? [];
    bucket.push(candidate);
    buckets.set(candidate.family, bucket);
  }
  const queues = [...buckets.values()];
  const interleaved: BackupCandidate[] = [];
  for (let round = 0; interleaved.length < tier.length; round++) {
    for (const queue of queues) if (round < queue.length) interleaved.push(queue[round]);
  }
  const perBrand = new Map<string, number>();
  const first: BackupCandidate[] = [];
  const later: BackupCandidate[] = [];
  for (const candidate of interleaved) {
    const brand = brandKey(candidate.channel.name);
    const seen = perBrand.get(brand) ?? 0;
    perBrand.set(brand, seen + 1);
    (seen < 2 ? first : later).push(candidate);
  }
  return [...first, ...later];
}

/** Two football channels, then one football-carrying network, while both last. */
function weave<T>(primary: T[], secondary: T[], ratio = 2): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < primary.length || j < secondary.length) {
    for (let k = 0; k < ratio && i < primary.length; k++) out.push(primary[i++]);
    if (j < secondary.length) out.push(secondary[j++]);
  }
  return out;
}

/** Final probe order: fixture → broadcaster → sports (football/network woven, then general). */
function orderTiers(sorted: BackupCandidate[]): BackupCandidate[] {
  const tiers = new Map<string, BackupCandidate[]>();
  for (const candidate of sorted) {
    const key = `${candidate.coverage}:${candidate.affinity}`;
    const tier = tiers.get(key) ?? [];
    tier.push(candidate);
    tiers.set(key, tier);
  }
  const tier = (coverage: BackupCoverage, affinity: number) => diversifyTier(tiers.get(`${coverage}:${affinity}`) ?? []);
  return [
    ...tier('fixture', 3),
    ...tier('broadcaster', 3), ...tier('broadcaster', 2), ...tier('broadcaster', 1),
    ...weave(tier('sports', 3), tier('sports', 2)),
    ...tier('sports', 1),
  ];
}

/**
 * Every eligible backup for a fixture, best evidence first. A listing naming
 * another game is only a generic backup when it comes from an event feed
 * (legacy behaviour); the official IPTV-Org/Guovin pools exclude them.
 */
export function rankLiveBackupCandidates(channels: LiveChannel[], fixture: BackupFixture): BackupCandidate[] {
  const seen = new Set<string>();
  const hints = [...(fixture.broadcasters ?? []), fixture.title].filter((hint): hint is string => Boolean(hint?.trim()));
  const ranked: Array<BackupCandidate & { index: number }> = [];
  channels.forEach((channel, index) => {
    if (seen.has(channel.url)) return;
    seen.add(channel.url);
    const family = backupFamily(channel.feedUrl);
    // Relevance first: it also keeps a "Real Madrid vs Barcelona" basketball
    // listing from posing as the football fixture, and bounds the matching
    // work to sports entries (Guovin alone lists ~1,600 general channels).
    let affinity = footballAffinity(channel, family);
    if (!affinity) return;
    const fixtureScore = fixture.title ? matchChannelScore(fixture.title, channel, fixture.homeTeam?.name, fixture.awayTeam?.name) : 0;
    if (fixtureScore > 0) {
      ranked.push({ channel, family, coverage: 'fixture', affinity: 3, score: fixtureScore, index });
      return;
    }
    const otherGame = Boolean(channel.matchTitle) || OTHER_GAME_RE.test(channel.name);
    if (otherGame) {
      if (family !== 'events') return;
      // Football content, but explicitly a different game: never above a network.
      affinity = Math.min(affinity, 2);
    }
    const network = hints.length ? broadcasterMatchScore(hints, channel) : 0;
    ranked.push({ channel, family, coverage: network > 0 ? 'broadcaster' : 'sports', affinity, score: network, index });
  });
  return orderTiers(ranked.sort(compareCandidates).map(({ index: _index, ...candidate }) => candidate));
}

/* -------------------------------------------------------------------------- */
/*  Bounded, rotating, self-advancing probe window                            */
/* -------------------------------------------------------------------------- */

const windows = new Map<string, { epoch: number; offset: number; dry: boolean }>();
const inflight = new Map<string, Promise<LiveBackup[]>>();

/** Test hook: forget probe windows and in-flight selections. */
export function resetLiveBackupSelection(): void {
  windows.clear();
  inflight.clear();
}

export function backupProbeWindow(candidates: BackupCandidate[], key: string, now = Date.now()): BackupCandidate[] {
  if (candidates.length <= MAX_BACKUP_PROBES) return candidates;
  const tail = candidates.slice(PINNED_PROBES);
  const step = MAX_BACKUP_PROBES - PINNED_PROBES;
  const epoch = Math.floor(now / HEALTH_REFRESH_MS);
  const previous = windows.get(key);
  // Rotate every refresh period — and immediately after a window found nothing.
  const offset = !previous ? 0 : previous.epoch === epoch && !previous.dry ? previous.offset : (previous.offset + step) % tail.length;
  if (!previous && windows.size >= 64) windows.delete(windows.keys().next().value!);
  windows.set(key, { epoch, offset, dry: false });
  return [...candidates.slice(0, PINNED_PROBES), ...Array.from({ length: step }, (_, index) => tail[(offset + index) % tail.length])];
}

function markWindowDry(key: string): void {
  const window = windows.get(key);
  if (window) window.dry = true;
}

/**
 * Probe-gated backups for a live fixture across every feed family. Never
 * throws: a failed probe service leaves event-feed entries as unverified
 * backups and simply yields no official entries.
 */
export async function selectLiveBackups(
  channels: LiveChannel[],
  fixture: BackupFixture,
  options: { limit?: number; exclude?: Iterable<string> } = {},
): Promise<LiveBackup[]> {
  const limit = Math.max(0, Math.min(MAX_LIVE_BACKUPS, options.limit ?? MAX_LIVE_BACKUPS));
  if (!limit) return [];
  const exclude = new Set(options.exclude ?? []);
  const candidates = rankLiveBackupCandidates(channels, fixture).filter(({ channel }) => !exclude.has(channel.url));
  if (!candidates.length) return [];

  const poolKey = crypto.createHash('sha256')
    .update(candidates.map(({ channel, coverage }) => `${channel.id}|${channel.url}|${channel.referer || ''}|${coverage}`).join('\n'))
    .digest('hex');
  const selected = backupProbeWindow(candidates, poolKey);
  const key = `${poolKey}:${selected.map(({ channel }) => channel.id).join(',')}:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    let health: Record<string, StreamHealth> = {};
    try {
      health = await getChannelHealth(selected.map(({ channel }) => channel), { limit: MAX_BACKUP_PROBES, verifyMedia: true });
    } catch (err) {
      // A failed status service must not hide event-feed channels.
      logger.warn('Could not verify live backups', { error: String(err) });
    }
    const verified: LiveBackup[] = [];
    const unverified: LiveBackup[] = [];
    for (const candidate of selected) {
      const result = freshHealth(health[candidate.channel.id]);
      if (result?.status === 'live' && result.mediaVerified === true && result.samples > 0) {
        verified.push({ ...candidate, health: result, verified: true });
      } else if (result?.status !== 'offline' && TOLERATES_UNVERIFIED.has(candidate.family)) {
        unverified.push({ ...candidate, health: result, verified: false });
      }
    }
    verified.sort((a, b) => COVERAGE_ORDER[a.coverage] - COVERAGE_ORDER[b.coverage] || b.affinity - a.affinity || compareStreamHealth(
      { health: a.health, quality: quality(a.channel), coverage: a.coverage },
      { health: b.health, quality: quality(b.channel), coverage: b.coverage },
    ));
    const picked = [...verified.slice(0, limit), ...unverified.slice(0, MAX_UNVERIFIED_BACKUPS)].slice(0, limit);
    if (!picked.length) markWindowDry(poolKey);
    return picked;
  })();
  inflight.set(key, pending);
  try { return await pending; } finally { if (inflight.get(key) === pending) inflight.delete(key); }
}

/** Provider id the player/UI understand (`*fallback*` = possibly another fixture). */
export function backupProvider(backup: Pick<LiveBackup, 'family' | 'coverage'>): string {
  if (backup.family === 'events') return backup.coverage === 'fixture' ? 'livefeed' : 'livefeed-fallback';
  return backup.coverage === 'fixture' ? backup.family : `${backup.family}-fallback-${backup.coverage}`;
}

/** Feed-backed providers always carry signed proxy links, never raw upstream URLs. */
export function isFeedProvider(provider: string | undefined): boolean {
  return /^(?:livefeed|iptv-org|guovin|standby)/.test(provider || '');
}
