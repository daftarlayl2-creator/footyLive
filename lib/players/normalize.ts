import type { MarketValue, PlayerHonor, PlayerProfile, SeasonPerformance } from './types';

export function playerHref(id: string | number, context?: { clubId?: string; league?: string }): string {
  const params = new URLSearchParams();
  if (context?.clubId && /^\d{1,10}$/.test(context.clubId)) params.set('club', context.clubId);
  if (context?.league && /^[a-z0-9.-]{1,40}$/i.test(context.league)) params.set('league', context.league);
  return `/player/${encodeURIComponent(String(id))}${params.size ? `?${params}` : ''}`;
}

export function safePlayerImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function playerAge(dateOfBirth: unknown, now = new Date()): number | undefined {
  if (typeof dateOfBirth !== 'string') return undefined;
  const birth = new Date(dateOfBirth);
  if (!Number.isFinite(birth.getTime()) || birth > now) return undefined;
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  const age = now.getUTCFullYear() - birth.getUTCFullYear() - Number(beforeBirthday);
  return age >= 12 && age <= 65 ? age : undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const n = Number(String(value).replace(/[,\s%]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : undefined;
}

export function rosterAthlete(json: any, id: string): any | null {
  const athletes = Array.isArray(json?.athletes) ? json.athletes : [];
  return athletes.flatMap((entry: any) => Array.isArray(entry?.items) ? entry.items : [entry])
    .find((athlete: any) => String(athlete?.id) === id) ?? null;
}

/** Common-v3 puts the club league in its first-party standings link. */
function teamLeague(team: any): string | undefined {
  const explicit = team?.league?.slug ?? team?.leagues?.[0]?.slug;
  if (typeof explicit === 'string' && /^[a-z0-9.-]{1,40}$/i.test(explicit) && explicit !== 'all') return explicit;
  for (const link of Array.isArray(team?.links) ? team.links : []) {
    if (typeof link?.href !== 'string') continue;
    try {
      const url = new URL(link.href);
      if (url.hostname === 'espn.com' || url.hostname.endsWith('.espn.com')) {
        const slug = /\/standings\/_\/league\/([a-z0-9.-]+)(?:\/|$)/i.exec(url.pathname)?.[1];
        if (slug) return slug;
      }
    } catch { /* ignore malformed provider links */ }
  }
  return undefined;
}

/** ESPN common-v3's displayDOB is D/M/YYYY; prefer the roster's ISO DOB. */
function displayBirthDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return undefined;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : undefined;
}

/** Named category stats and ESPN overview tables (parallel `names` / `stats`). */
function statValues(statistics: any): Record<string, number> {
  const values: Record<string, number> = {};
  const add = (name: unknown, value: unknown) => {
    const n = numberOf(value);
    if (typeof name === 'string' && n !== undefined) values[name.toLowerCase().replace(/[^a-z0-9]/g, '')] = n;
  };
  const categories = statistics?.splits?.categories ?? statistics?.categories ?? [];
  for (const category of Array.isArray(categories) ? categories : []) {
    for (const stat of Array.isArray(category?.stats) ? category.stats : []) add(stat?.name, stat?.value ?? stat?.displayValue);
  }
  for (const stat of Array.isArray(statistics?.stats) ? statistics.stats : []) add(stat?.name, stat?.value ?? stat?.displayValue);
  const names = statistics?.names ?? statistics?.labels;
  if (Array.isArray(names)) {
    const split = Array.isArray(statistics?.splits) ? statistics.splits.find((s: any) => !/career/i.test(s?.displayName || '')) : null;
    const row = split?.stats ?? statistics?.stats;
    if (Array.isArray(row)) names.forEach((name: unknown, index: number) => add(name, row[index]));
  }
  return values;
}

function seasonLabel(value: any): string | undefined {
  if (typeof value === 'string') return text(value);
  return text(value?.displayName ?? value?.name) ?? (numberOf(value?.year) !== undefined ? String(value.year) : undefined);
}

/** Extract one reported season, not career totals or a sum of different competitions. */
export function normalizeSeasonPerformance(overview: any, roster: any, stats: any, id: string, now = new Date()): SeasonPerformance {
  const athlete = rosterAthlete(roster, id);
  const clubId = String(overview?.athlete?.team?.id ?? roster?.team?.id ?? '');
  const league = teamLeague(overview?.athlete?.team ?? roster?.team);
  const candidates: Array<{ label: string; values: Record<string, number>; scope?: string; year: number }> = [];
  const add = (statistics: any, label: string | undefined, scope?: string, explicitYear?: number) => {
    if (!label || /career|all.time/i.test(label)) return;
    const year = Number(/\b(20\d{2})\b/.exec(label)?.[1]) || explicitYear;
    if (year === undefined || !Number.isFinite(year) || year > now.getUTCFullYear()) return;
    const values = statValues(statistics);
    if (Object.keys(values).length) candidates.push({ label, values, scope, year });
  };
  add(athlete?.statistics, seasonLabel(roster?.season), text(roster?.league?.name));
  const summary = overview?.statistics ?? overview?.athlete?.statistics;
  const scopedSplits = Array.isArray(summary?.splits) && summary.splits.some((split: any) => split?.teamId || split?.leagueSlug);
  if (!scopedSplits) add(summary, seasonLabel(summary?.season ?? overview?.season ?? summary?.displayName), text(summary?.competition?.name));

  // Real soccer overview payloads have no athlete identity or top-level season:
  // each parallel-stat split supplies its own season, team and competition.
  if (Array.isArray(summary?.names)) {
    for (const split of Array.isArray(summary?.splits) ? summary.splits : []) {
      if (clubId && split?.teamId && String(split.teamId) !== clubId) continue;
      if (league && split?.leagueSlug && split.leagueSlug !== league) continue;
      const label = seasonLabel(split?.displayName);
      add({ names: summary.names, stats: split?.stats }, label, text(label?.replace(/^20\d{2}(?:[-–/]\d{2,4})?\s*/, '')));
    }
  }
  // Common-v3 identity responses also provide a dated, club-specific summary.
  const compact = overview?.athlete?.statsSummary;
  const compactStats = Array.isArray(compact?.statistics) ? [...compact.statistics] : [];
  const startsAndSubs = compactStats.find((stat: any) => stat.name === 'starts-subIns')?.displayValue;
  const appearanceParts = typeof startsAndSubs === 'string' ? /^(\d+)\s*\((\d+)\)$/.exec(startsAndSubs) : null;
  if (appearanceParts) compactStats.push({ name: 'appearances', value: Number(appearanceParts[1]) + Number(appearanceParts[2]) });
  const compactLabel = text(compact?.displayName)?.replace(/\s+Stats$/i, '');
  const matchingSummary = candidates.find((entry) => entry.label === compactLabel);
  if (matchingSummary) Object.assign(matchingSummary.values, statValues({ stats: compactStats }));
  else add({ stats: compactStats }, compactLabel, league);

  // Common-v3 stats tables: only a season row, never the `totals` / career row.
  const tableRows = new Map<string, { label: string; scope?: string; year?: number; stats: any[] }>();
  for (const category of Array.isArray(stats?.categories) ? stats.categories : []) {
    const names = category.names ?? category.labels;
    if (!Array.isArray(names)) continue;
    for (const row of Array.isArray(category?.statistics) ? category.statistics : []) {
      if (clubId && row?.team?.id && String(row.team.id) !== clubId) continue;
      if (league && row?.league?.slug && row.league.slug !== league) continue;
      const label = seasonLabel(row.season);
      if (!label || !Array.isArray(row.stats)) continue;
      const scope = text(row?.league?.name ?? stats?.league?.name ?? stats?.competition?.name);
      // Merge statistical categories only within this exact season/team/league,
      // never separate competitions or rows for another club after a transfer.
      const key = `${label}|${row?.team?.id || clubId}|${row?.league?.slug || scope || ''}`;
      const current = tableRows.get(key) ?? { label, scope, year: numberOf(row?.season?.year), stats: [] };
      current.stats.push(...names.map((name: string, index: number) => ({ name, value: row.stats[index] })));
      tableRows.set(key, current);
    }
  }
  for (const row of tableRows.values()) add({ stats: row.stats }, row.label, row.scope, row.year);

  candidates.sort((a, b) => b.year - a.year || Object.keys(b.values).length - Object.keys(a.values).length);
  const selected = candidates[0];
  if (!selected) return { label: 'Season not reported', current: false };
  const first = (...names: string[]) => names.map((name) => selected.values[name]).find((value) => value !== undefined);
  const appearances = first('appearances', 'totalappearances', 'apps', 'app');
  const goals = first('totalgoals', 'goals', 'g');
  const assists = first('goalassists', 'assists', 'a');
  const minutes = first('minutesplayed', 'totalminutes', 'minutes', 'min', 'mins');
  let passAccuracy = first('passaccuracy', 'passcompletionpercentage', 'passcompletionpct', 'accuratepassespercentage', 'passpct');
  const passes = first('totalpasses', 'passes');
  const completed = first('accuratepasses', 'successfulpasses', 'completedpasses');
  if (passAccuracy === undefined && passes && completed !== undefined && completed <= passes) passAccuracy = completed / passes * 100;
  if (passAccuracy !== undefined && passAccuracy > 100) passAccuracy = undefined;
  // Split-year seasons remain current until the next summer; calendar-year
  // leagues stay current for the whole reported year.
  const splitYear = /20\d{2}\s*[-–/]\s*\d{2,4}/.test(selected.label);
  const expectedYear = now.getUTCFullYear() - Number(splitYear && now.getUTCMonth() < 6);
  return {
    label: selected.label, scope: selected.scope, current: selected.year === expectedYear,
    ...(appearances !== undefined ? { appearances } : {}), ...(goals !== undefined ? { goals } : {}),
    ...(assists !== undefined ? { assists } : {}), ...(minutes !== undefined ? { minutes } : {}),
    ...(passAccuracy !== undefined ? { passAccuracy } : {}),
  };
}

export function normalizeMarketValue(raw: any): MarketValue | undefined {
  const amount = numberOf(raw?.amount ?? raw?.value);
  const currency = typeof raw?.currency === 'string' ? raw.currency.toUpperCase() : '';
  const asOf = text(raw?.asOf ?? raw?.date);
  if (!amount || !/^[A-Z]{3}$/.test(currency) || !asOf || !Number.isFinite(Date.parse(asOf))) return undefined;
  return { amount, currency, asOf, source: safePlayerImage(raw.source) };
}

function normalizeHonors(raw: any): PlayerHonor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((award, index) => {
    const name = text(award?.name ?? award?.displayName);
    const years = (Array.isArray(award?.years) ? award.years : [award?.year]).filter((year: unknown) => typeof year === 'number' || typeof year === 'string').map(String);
    if (!name || !years.length) return [];
    return [{ id: `provider-${index}`, name, category: award.category === 'team' ? 'team' as const : 'individual' as const, years, source: safePlayerImage(award.source) }];
  });
}

export function normalizePlayerProfile(overview: any, roster: any = null, stats: any = null, now = new Date()): PlayerProfile | null {
  const raw = overview?.athlete ?? overview;
  const id = String(raw?.id ?? '');
  const name = text(raw?.displayName ?? raw?.fullName);
  if (!/^\d{1,10}$/.test(id) || !name) return null;
  const rosterPlayer = rosterAthlete(roster, id);
  const birthDate = text(raw.dateOfBirth ?? rosterPlayer?.dateOfBirth) ?? displayBirthDate(raw.displayDOB);
  const reportedAge = playerAge(birthDate, now) ?? numberOf(raw.age ?? rosterPlayer?.age);
  const age = reportedAge !== undefined && reportedAge >= 12 && reportedAge <= 65 ? reportedAge : undefined;
  const team = raw.team ?? overview?.team ?? roster?.team;
  const clubName = text(team?.displayName ?? team?.name);
  const nationality = text(raw.citizenship ?? raw.nationality ?? raw.flag?.alt ?? rosterPlayer?.citizenship);
  return {
    id, name, fullName: text(raw.fullName), portrait: safePlayerImage(raw.headshot?.href ?? raw.headshot ?? rosterPlayer?.headshot?.href),
    dateOfBirth: birthDate, ...(age !== undefined ? { age } : {}),
    position: text(raw.position?.displayName ?? raw.position?.name ?? rosterPlayer?.position?.name) ?? 'Player',
    jersey: raw.jersey != null ? String(raw.jersey) : rosterPlayer?.jersey,
    nationality, flag: safePlayerImage(raw.flag?.href ?? rosterPlayer?.flag?.href),
    ...(clubName ? { club: {
      name: clubName, id: /^\d+$/.test(String(team?.id)) ? String(team.id) : undefined,
      logo: safePlayerImage(team?.logo ?? team?.logos?.[0]?.href),
      league: teamLeague(team) ?? text(raw.league?.slug),
    } } : {}),
    marketValue: normalizeMarketValue(raw.marketValue),
    season: normalizeSeasonPerformance(overview, roster, stats, id, now),
    honors: normalizeHonors(raw.awards ?? overview?.awards), updatedAt: now.getTime(),
  };
}
