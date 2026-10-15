import { describe, it, expect } from 'vitest';
import {
  clockLabel,
  describePeriod,
  formatGoalMinutes,
  formatScorerLine,
  groupGoals,
  minuteValue,
  normalizeMinute,
  parseScorerLine,
  scorersBySide,
} from './scoreboard';

describe('parseScorerLine', () => {
  it('splits the scorer and the minute', () => {
    expect(parseScorerLine("Bukayo Saka 20'")).toEqual({ player: 'Bukayo Saka', minute: "20'", penalty: false, ownGoal: false });
    expect(parseScorerLine("Alphadjo Cissè 15'")).toMatchObject({ player: 'Alphadjo Cissè', minute: "15'" });
  });

  it('understands stoppage time, penalties and own goals', () => {
    expect(parseScorerLine("Mohamed Salah 45'+2'")).toMatchObject({ player: 'Mohamed Salah', minute: "45'+2'" });
    expect(parseScorerLine('Kane 90 + 3 (pen)')).toMatchObject({ player: 'Kane', minute: "90'+3'", penalty: true });
    expect(parseScorerLine("Doe 40' (OG)")).toMatchObject({ player: 'Doe', minute: "40'", ownGoal: true });
  });

  it('handles bare minutes, placeholders and digits inside names', () => {
    expect(parseScorerLine("63'")).toEqual({ player: '', minute: "63'", penalty: false, ownGoal: false });
    expect(parseScorerLine('Goal')).toEqual({ player: '', minute: '', penalty: false, ownGoal: false });
    expect(parseScorerLine('Player99')).toMatchObject({ player: 'Player99', minute: '' });
    expect(parseScorerLine('')).toMatchObject({ player: '', minute: '' });
  });
});

describe('minute helpers', () => {
  it('normalises and orders minutes', () => {
    expect(normalizeMinute('45 + 2')).toBe("45'+2'");
    expect(normalizeMinute('12’')).toBe("12'");
    expect(minuteValue("45'+2'")).toBeCloseTo(45.02);
    expect(minuteValue("46'")).toBeGreaterThan(minuteValue("45'+9'"));
    expect(minuteValue('')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('groupGoals', () => {
  it('groups every goal of a player into one line ordered by minute', () => {
    const groups = groupGoals([
      { player: 'Alphadjo Cissè', minute: "32'" },
      { player: 'Rafael Leão', minute: "20'" },
      { player: 'alphadjo  cissè', minute: "15'" },
    ]);
    expect(groups.map(formatScorerLine)).toEqual(["Alphadjo Cissè 15', 32'", "Rafael Leão 20'"]);
  });

  it('keeps penalty and own-goal markers per goal', () => {
    const [group] = groupGoals([
      { player: 'Kane', minute: "70'", penalty: true },
      { player: 'Kane', minute: "12'" },
    ]);
    expect(formatGoalMinutes(group.goals)).toBe("12', 70' (P)");
    expect(formatScorerLine(groupGoals([{ player: '', minute: "63'" }])[0])).toBe("Goal 63'");
  });
});

describe('scorersBySide', () => {
  it('anchors structured goals to the side that scored', () => {
    const result = scorersBySide({
      goals: [
        { side: 'home', player: 'Alphadjo Cissè', minute: "15'", penalty: false, ownGoal: false },
        { side: 'away', player: 'Lautaro Martínez', minute: "58'", penalty: true, ownGoal: false },
        { side: 'home', player: 'Alphadjo Cissè', minute: "32'", penalty: false, ownGoal: false },
      ],
      scorers: { home: ['ignored'], away: [] },
    });
    expect(result.home.map(formatScorerLine)).toEqual(["Alphadjo Cissè 15', 32'"]);
    expect(result.away.map(formatScorerLine)).toEqual(["Lautaro Martínez 58' (P)"]);
  });

  it('falls back to the legacy per-side strings', () => {
    const result = scorersBySide({ goals: [], scorers: { home: ["Bukayo Saka 20'", "Bukayo Saka 67'"], away: ["Mohamed Salah 45'+0'"] } });
    expect(result.home.map(formatScorerLine)).toEqual(["Bukayo Saka 20', 67'"]);
    expect(result.away.map(formatScorerLine)).toEqual(["Mohamed Salah 45'+0'"]);
    expect(scorersBySide({})).toEqual({ home: [], away: [] });
  });
});

describe('describePeriod / clockLabel', () => {
  it('reads ESPN period descriptions', () => {
    expect(describePeriod({ status: 'live', period: 'First Half', currentMinute: "23'" })).toBe('1st half');
    expect(describePeriod({ status: 'live', period: 'Second Half', currentMinute: "67'" })).toBe('2nd half');
    expect(describePeriod({ status: 'live', period: 'Halftime', currentMinute: 'HT' })).toBe('Half-time');
    expect(describePeriod({ status: 'live', period: 'Extra Time', currentMinute: "97'" })).toBe('Extra time');
    expect(describePeriod({ status: 'live', period: 'Penalties' })).toBe('Penalties');
  });

  it('derives the half from the minute when the description is generic', () => {
    expect(describePeriod({ status: 'live', period: 'In Progress', currentMinute: "45'+2'", currentMinuteNumber: 45 })).toBe('1st half');
    expect(describePeriod({ status: 'live', currentMinuteNumber: 90, currentMinute: "90'+4'" })).toBe('2nd half');
    expect(describePeriod({ status: 'live', currentMinuteNumber: 105 })).toBe('Extra time');
    expect(describePeriod({ status: 'live' })).toBe('Live');
  });

  it('labels finished and upcoming matches', () => {
    expect(describePeriod({ status: 'finished', period: 'Full Time' })).toBe('Full time');
    expect(describePeriod({ status: 'finished', period: 'Final - AET' })).toBe('After extra time');
    expect(describePeriod({ status: 'finished', period: 'Final - Pens' })).toBe('After penalties');
    expect(describePeriod({ status: 'upcoming' })).toBe('Kick-off');
  });

  it('formats the centre clock', () => {
    expect(clockLabel({ status: 'live', currentMinute: "67'" })).toBe("67'");
    expect(clockLabel({ status: 'live', currentMinuteNumber: 12 })).toBe("12'");
    expect(clockLabel({ status: 'live' })).toBe('LIVE');
    expect(clockLabel({ status: 'finished' })).toBe('FT');
    expect(clockLabel({ status: 'upcoming' })).toBe('');
  });
});
