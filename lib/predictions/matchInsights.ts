/** Transparent lightweight statistical estimates, not a trained AI or betting advice. */
import type { ClubMatch } from '@/lib/clubs/espnClub';
import { toPercentages } from '@/lib/predictions';

export type FormResult = 'W' | 'D' | 'L';
export interface H2HRecord {
  homeWins: number;
  draws: number;
  awayWins: number;
  total: number;
  avgGoals: number;
}
export interface WinProbabilityInput {
  homeForm?: FormResult[] | null;
  awayForm?: FormResult[] | null;
  homePoints?: number | null;
  awayPoints?: number | null;
  homePlayed?: number | null;
  awayPlayed?: number | null;
  h2h?: H2HRecord | null;
}
export interface WinProbability { home: number; draw: number; away: number }

export function formPoints(form: FormResult[] | null | undefined): number {
  return (form || []).reduce((sum, result) => sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0), 0);
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const validPointPair = (input: WinProbabilityInput) => [input.homePoints, input.awayPoints].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);

/** Missing factors are omitted, not treated as zero-point/losing teams. */
export function computeWinProbability(input: WinProbabilityInput): WinProbability | null {
  const factors: { edge: number; weight: number }[] = [];
  if (input.homeForm?.length && input.awayForm?.length) {
    // Two neutral pseudo-results temper very small samples.
    const home = (formPoints(input.homeForm) + 3) / ((input.homeForm.length + 2) * 3);
    const away = (formPoints(input.awayForm) + 3) / ((input.awayForm.length + 2) * 3);
    factors.push({ edge: home - away, weight: 0.55 });
  }
  if (validPointPair(input)) {
    const perGame = input.homePlayed && input.awayPlayed && input.homePlayed > 0 && input.awayPlayed > 0;
    const edge = perGame
      ? (input.homePoints! / input.homePlayed! - input.awayPoints! / input.awayPlayed!) / 3
      : (input.homePoints! - input.awayPoints!) / Math.max(10, input.homePoints! + input.awayPoints!);
    factors.push({ edge: clamp(edge, -1, 1), weight: 0.3 });
  }
  if (input.h2h && input.h2h.total > 0) {
    const { homeWins, awayWins, total } = input.h2h;
    factors.push({ edge: (homeWins - awayWins) / (total + 2), weight: 0.15 });
  }
  if (!factors.length) return null;
  const weight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const edge = clamp(factors.reduce((sum, factor) => sum + factor.edge * factor.weight, 0) / weight, -1, 1);
  const draw = clamp(0.29 - Math.abs(edge) * 0.12, 0.17, 0.29);
  const homeShare = 1 / (1 + Math.exp(-(edge * 2.5 + 0.16)));
  return toPercentages({ home: (1 - draw) * homeShare, draw, away: (1 - draw) * (1 - homeShare) });
}

/** Union both schedules; de-duplicate and reorient results to the fixture's home club. */
export function summarizeH2H(results: ClubMatch[], homeId: string, awayId: string, before: number): H2HRecord | null {
  if (!homeId || !awayId || homeId === awayId) return null;
  const unique = new Map<string, ClubMatch>();
  for (const match of results) {
    if (match.status !== 'finished' || !(Date.parse(match.date) < before)) continue;
    const ids = [match.home.id, match.away.id];
    if (!ids.includes(homeId) || !ids.includes(awayId)) continue;
    if (![match.home.score, match.away.score].every((score) => typeof score === 'number' && Number.isFinite(score) && score >= 0)) continue;
    unique.set(match.id, match);
  }
  const meetings = [...unique.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
  if (!meetings.length) return null;
  let homeWins = 0, awayWins = 0, draws = 0, goals = 0;
  for (const meeting of meetings) {
    const home = meeting.home.id === homeId ? meeting.home.score! : meeting.away.score!;
    const away = meeting.home.id === awayId ? meeting.home.score! : meeting.away.score!;
    if (home > away) homeWins++;
    else if (home < away) awayWins++;
    else draws++;
    goals += home + away;
  }
  return { homeWins, awayWins, draws, total: meetings.length, avgGoals: goals / meetings.length };
}

export interface InsightInput extends WinProbabilityInput { homeName: string; awayName: string }
export function buildInsights(input: InsightInput): string[] {
  const insights: string[] = [];
  for (const [name, form] of [[input.homeName, input.homeForm], [input.awayName, input.awayForm]] as const) {
    if (form?.length) insights.push(`${name} won ${form.filter((result) => result === 'W').length} of their last ${form.length} matches.`);
  }
  if (input.h2h?.total) {
    const h = input.h2h;
    insights.push(`${h.avgGoals >= 3 ? 'High-scoring fixture history' : 'Fixture history'}: avg ${h.avgGoals.toFixed(1)} goals across ${h.total} available meetings. ${input.homeName}: ${h.homeWins}W · ${h.draws}D · ${h.awayWins}L.`);
  }
  if (validPointPair(input)) insights.push(`Current league points: ${input.homeName} ${input.homePoints} · ${input.awayName} ${input.awayPoints}.`);
  if (!input.h2h?.total) insights.push('No previous meetings available in the current history feed; head-to-head is excluded from the estimate.');
  if (!input.homeForm?.length || !input.awayForm?.length) insights.push('Recent form coverage is incomplete; no missing results are assumed.');
  return insights.slice(0, 3);
}
