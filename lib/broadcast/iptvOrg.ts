/** Server-only, health-gated fixture/network mapping for the official sports feed. */
import crypto from 'crypto';
import type { Channel } from '@/lib/types';
import { compareStreamHealth, freshHealth, HEALTH_REFRESH_MS, type StreamHealth } from '@/lib/player/health';
import { broadcasterMatchScore } from './broadcasters';
import { inferStreamQuality, matchChannelScore } from './matching';
import { getChannelHealth } from './probe';
import { isIptvOrgFeed } from './sources';
import type { LiveChannel } from './types';

export interface IptvFixture {
  title: string;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
  broadcasters?: string[];
}
export interface IptvCandidate {
  channel: LiveChannel;
  coverage: NonNullable<Channel['coverage']>;
  score: number;
}
export interface VerifiedIptvCandidate extends IptvCandidate { health: StreamHealth }

export const MAX_IPTV_ORG_SERVERS = 3;
export const MAX_IPTV_ORG_PROBES = 24;
const PINNED_PROBES = 12;
const priority = { fixture: 0, broadcaster: 1, sports: 2 };
const qualityOrder = { FHD: 0, HD: 1, SD: 2, Auto: 3 };
const quality = (channel: LiveChannel) => inferStreamQuality(channel.name, channel.quality, channel.tvgId, ...(channel.tags ?? []));

/** Exact two-team evidence outranks explicit network hints; no league-rights guesses. */
export function rankIptvOrgCandidates(channels: LiveChannel[], fixture: IptvFixture, allowFallback = true): IptvCandidate[] {
  const seen = new Set<string>();
  const candidates: IptvCandidate[] = [];
  for (const channel of channels) {
    if (!isIptvOrgFeed(channel.feedUrl) || seen.has(channel.url)) continue;
    seen.add(channel.url);
    const score = matchChannelScore(fixture.title, channel, fixture.homeTeam?.name, fixture.awayTeam?.name);
    if (score > 0) { candidates.push({ channel, score, coverage: 'fixture' }); continue; }
    if (!allowFallback) continue;
    // Do not deliberately recommend a listing explicitly naming another game.
    if (channel.matchTitle || /\s+(?:vs?\.?|versus|ضد)\s+/i.test(channel.name)) continue;
    const network = broadcasterMatchScore([...(fixture.broadcasters ?? []), fixture.title], channel);
    candidates.push({ channel, score: network, coverage: network ? 'broadcaster' : 'sports' });
  }
  return candidates.sort((a, b) => priority[a.coverage] - priority[b.coverage] || b.score - a.score || qualityOrder[quality(a.channel)] - qualityOrder[quality(b.channel)]);
}

// Keep the best candidates, but explore beyond dead/blocked front-of-list
// entries every 30 seconds. Identical pools share a window and in-flight work;
// simultaneous dashboard/four-slot requests do not each scan a new 24 channels.
const windows = new Map<string, { epoch: number; offset: number }>();
const inflight = new Map<string, Promise<VerifiedIptvCandidate[]>>();

export function resetIptvOrgSelection(): void { windows.clear(); inflight.clear(); }

function probeWindow(candidates: IptvCandidate[], key: string): IptvCandidate[] {
  if (candidates.length <= MAX_IPTV_ORG_PROBES) return candidates;
  const tail = candidates.slice(PINNED_PROBES);
  const epoch = Math.floor(Date.now() / HEALTH_REFRESH_MS);
  const previous = windows.get(key);
  const offset = previous ? (previous.epoch === epoch ? previous.offset : (previous.offset + MAX_IPTV_ORG_PROBES - PINNED_PROBES) % tail.length) : 0;
  if (!previous && windows.size >= 64) windows.delete(windows.keys().next().value!);
  windows.set(key, { epoch, offset });
  return [...candidates.slice(0, PINNED_PROBES), ...Array.from({ length: MAX_IPTV_ORG_PROBES - PINNED_PROBES }, (_, index) => tail[(offset + index) % tail.length])];
}

/** Unknown, offline, stale or manifest-only results are NEVER automatically injected. */
export async function selectVerifiedIptvOrgChannels(
  channels: LiveChannel[], fixture: IptvFixture, options: { allowFallback?: boolean; limit?: number } = {},
): Promise<VerifiedIptvCandidate[]> {
  const limit = Math.max(0, Math.min(MAX_IPTV_ORG_SERVERS, options.limit ?? MAX_IPTV_ORG_SERVERS));
  if (!limit) return [];
  const candidates = rankIptvOrgCandidates(channels, fixture, options.allowFallback ?? true);
  if (!candidates.length) return [];
  const poolKey = crypto.createHash('sha256').update(candidates.map(({ channel, coverage }) => `${channel.id}|${channel.url}|${channel.referer || ''}|${coverage}`).join('\n')).digest('hex');
  const selected = probeWindow(candidates, poolKey);
  const key = `${poolKey}:${selected.map(({ channel }) => channel.id).join(',')}:${limit}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const health = await getChannelHealth(selected.map(({ channel }) => channel), { limit: MAX_IPTV_ORG_PROBES, verifyMedia: true });
    return selected.filter(({ channel }) => {
      const result = freshHealth(health[channel.id]);
      return result?.status === 'live' && result.mediaVerified === true && result.samples > 0;
    }).map((candidate) => ({ ...candidate, health: health[candidate.channel.id] }))
      .sort((a, b) => priority[a.coverage] - priority[b.coverage] || compareStreamHealth(
        { health: a.health, quality: quality(a.channel) }, { health: b.health, quality: quality(b.channel) },
      )).slice(0, limit);
  })();
  inflight.set(key, pending);
  try { return await pending; } finally { if (inflight.get(key) === pending) inflight.delete(key); }
}
