import type { Match } from '@/lib/types';

/** One verified ticker entry. Nothing here is ever invented: every item is
 * rendered from a canonical Match the provider pipeline already verified. */
export interface TickerItem {
  id: string;
  kind: 'live' | 'finished' | 'upcoming';
  label: string;
  href: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;

function numericScore(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return null;
}

function scoreText(match: Match): string | null {
  const home = numericScore(match.homeScore);
  const away = numericScore(match.awayScore);
  if (home == null || away == null) return null;
  return `${home}–${away}`;
}

function kickoffTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build ticker items from canonical matches:
 *  - in-progress matches (live flag only from upstream status, never inferred),
 *  - verified final results finished within the last 24 hours,
 *  - today's upcoming fixtures (kickoff times only — never scored).
 * News headlines are intentionally absent: no verified news source is
 * configured, so the ticker never fabricates them.
 */
export function buildTickerItems(matches: Match[], now = Date.now()): TickerItem[] {
  const seen = new Set<string>();
  const live: TickerItem[] = [];
  const finals: TickerItem[] = [];
  const upcoming: TickerItem[] = [];

  const dateNow = new Date(now);
  const startOfToday = new Date(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate()).getTime();
  const endOfToday = startOfToday + DAY_MS;

  for (const match of matches || []) {
    if (!match?.id || seen.has(match.id)) continue;
    const home = match.homeTeam?.name;
    const away = match.awayTeam?.name;
    if (!home || !away) continue;
    const competition = match.tournament ? ` · ${match.tournament}` : '';
    const href = `/match/${match.id}`;

    if (match.status === 'live') {
      const score = scoreText(match);
      const minute = match.currentMinute ? `${match.currentMinute.replace(/'+$/, '')}′ ` : '';
      if (!score) continue; // live without a verified score: show nothing rather than guess
      seen.add(match.id);
      live.push({ id: `live-${match.id}`, kind: 'live', href, label: `LIVE ${minute}${home} ${score} ${away}${competition}` });
    } else if (match.status === 'finished') {
      const score = scoreText(match);
      const finishedAt = match.timestamp || 0;
      if (!score || !finishedAt || now - finishedAt > DAY_MS || finishedAt > now) continue;
      seen.add(match.id);
      finals.push({ id: `ft-${match.id}`, kind: 'finished', href, label: `FT ${home} ${score} ${away}${competition}` });
    } else {
      const ts = match.timestamp || 0;
      if (!ts || ts < startOfToday || ts >= endOfToday || ts < now) continue;
      seen.add(match.id);
      upcoming.push({ id: `up-${match.id}`, kind: 'upcoming', href, label: `${kickoffTime(ts)} ${home} vs ${away}${competition}` });
    }
  }

  finals.sort((a, b) => a.label.localeCompare(b.label));
  upcoming.sort((a, b) => a.label.localeCompare(b.label));
  return [...live, ...finals, ...upcoming].slice(0, MAX_ITEMS);
}
