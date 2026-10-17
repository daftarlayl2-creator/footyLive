import { describe, expect, it } from 'vitest';
import { eventIconKey, eventIconLabel } from './eventIcons';
import { classifyEspnEventType } from '@/lib/providers/espn';

describe('event icon mapping (Phase 11)', () => {
  it('maps the typed vocabulary, with own-goal and penalty flags winning', () => {
    expect(eventIconKey({ type: 'goal', label: 'Goal' })).toBe('goal');
    expect(eventIconKey({ type: 'goal', label: 'Goal', ownGoal: true })).toBe('own-goal');
    expect(eventIconKey({ type: 'goal', label: 'Goal', penalty: true })).toBe('penalty-goal');
    expect(eventIconKey({ type: 'own-goal', label: 'Own Goal' })).toBe('own-goal');
    expect(eventIconKey({ type: 'penalty', label: 'Penalty - Scored' })).toBe('penalty-goal');
    expect(eventIconKey({ type: 'yellow', label: 'Yellow Card' })).toBe('yellow-card');
    expect(eventIconKey({ type: 'red', label: 'Red Card' })).toBe('red-card');
    expect(eventIconKey({ type: 'substitution', label: 'Substitution' })).toBe('substitution');
  });

  it('distinguishes penalty awarded / missed from a penalty goal', () => {
    expect(eventIconKey({ type: 'other', label: 'Penalty - Awarded' })).toBe('penalty-award');
    expect(eventIconKey({ type: 'other', label: 'Penalty Won' })).toBe('penalty-award');
    expect(eventIconKey({ type: 'other', label: 'Penalty - Missed' })).toBe('penalty-missed');
    expect(eventIconKey({ type: 'other', label: 'Penalty - Saved' })).toBe('penalty-missed');
    expect(eventIconLabel({ type: 'penalty', label: 'Penalty - Scored' })).toBe('Penalty goal');
  });

  it('falls back neutrally for unknown or missing events', () => {
    expect(eventIconKey({ type: 'other', label: 'Halftime' })).toBe('other');
    expect(eventIconKey({ type: 'other', label: '' })).toBe('other');
    expect(eventIconKey(null)).toBe('other');
    expect(eventIconKey(undefined)).toBe('other');
  });

  it('classifier ordering: specific penalty/own-goal texts beat the generic goal match', () => {
    expect(classifyEspnEventType('Own Goal')).toBe('own-goal');
    expect(classifyEspnEventType('Penalty - Scored')).toBe('penalty');
    expect(classifyEspnEventType('Penalty - Missed')).toBe('other'); // never a goal
    expect(classifyEspnEventType('Penalty - Awarded')).toBe('other'); // not scored yet
    expect(classifyEspnEventType('Second Yellow Card')).toBe('red');
    expect(classifyEspnEventType('Yellow Card')).toBe('yellow');
    expect(classifyEspnEventType('Goal - Header')).toBe('goal');
    expect(classifyEspnEventType('Kickoff')).toBe('other');
  });
});
