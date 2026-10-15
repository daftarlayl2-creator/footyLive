// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function parameter() { return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
function audioFake(state = 'running') {
  const oscillators: any[] = [];
  const filters: any[] = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const audio = {
    state, currentTime: 0, sampleRate: 8000, destination: {},
    resume: vi.fn(async () => { audio.state = 'running'; }),
    createGain: vi.fn(() => ({ ...node(), gain: parameter() })),
    createBiquadFilter: vi.fn(() => { const filter = { ...node(), frequency: parameter(), Q: { value: 0 }, type: '' }; filters.push(filter); return filter; }),
    createOscillator: vi.fn(() => { const osc = { ...node(), frequency: parameter(), type: '', start: vi.fn(), stop: vi.fn(), onended: null }; oscillators.push(osc); return osc; }),
    createBuffer: vi.fn((_channels, length) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => ({ ...node(), start: vi.fn(), stop: vi.fn(), buffer: null, onended: null })),
  };
  return { audio, oscillators, filters };
}

beforeEach(() => { vi.resetModules(); window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('retro goal audio', () => {
  it('synthesises the voiced vowel, cheer and broadcast stinger, reusing one context', async () => {
    const { audio, oscillators, filters } = audioFake();
    const construct = vi.fn(function () { return audio; });
    vi.stubGlobal('AudioContext', construct);
    const { playGoalAlert } = await import('./goalAlert');
    expect(playGoalAlert()).toBe(true);
    expect(oscillators).toHaveLength(8);
    expect(filters).toHaveLength(4);
    expect(audio.createBufferSource).toHaveBeenCalledOnce();
    for (const osc of oscillators) {
      expect(osc.stop.mock.calls[0][0]).toBeGreaterThan(osc.start.mock.calls[0][0]);
      osc.onended();
      expect(osc.disconnect).toHaveBeenCalledOnce();
    }
    expect(playGoalAlert()).toBe(false); // no stacking rapid fanfares
    expect(construct).toHaveBeenCalledOnce();
  });
  it('obeys its independent persisted toggle and notifies same-tab subscribers', async () => {
    const { audio } = audioFake();
    vi.stubGlobal('AudioContext', vi.fn(function () { return audio; }));
    const goal = await import('./goalAlert');
    const listener = vi.fn();
    const unsubscribe = goal.subscribeGoalAlertPreference(listener);
    goal.setGoalAlertEnabled(false);
    expect(goal.isGoalAlertEnabled()).toBe(false);
    expect(goal.playGoalAlert()).toBe(false);
    expect(audio.createOscillator).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(goal.GOAL_ALERT_PREF_KEY)).toBe('off');
    goal.setGoalAlertEnabled(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(goal.playGoalAlert()).toBe(true);
    unsubscribe();
  });
  it('uses in-session preferences when storage is blocked', async () => {
    const goal = await import('./goalAlert');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    goal.setGoalAlertEnabled(false);
    expect(goal.isGoalAlertEnabled()).toBe(false);
    goal.setGoalAlertEnabled(true);
    expect(goal.isGoalAlertEnabled()).toBe(true);
  });
  it('syncs another tab’s preference and cleans listeners on unmount', async () => {
    const goal = await import('./goalAlert');
    const listener = vi.fn();
    const unsubscribe = goal.subscribeGoalAlertPreference(listener);
    goal.setGoalAlertEnabled(true);
    window.localStorage.setItem(goal.GOAL_ALERT_PREF_KEY, 'off');
    window.dispatchEvent(new StorageEvent('storage', { key: goal.GOAL_ALERT_PREF_KEY }));
    expect(goal.isGoalAlertEnabled()).toBe(false);
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: goal.GOAL_ALERT_PREF_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('warms/resumes without scheduling sound or replaying an old blocked goal', async () => {
    const { audio } = audioFake('suspended');
    audio.resume.mockImplementation(async () => {});
    vi.stubGlobal('AudioContext', vi.fn(function () { return audio; }));
    const goal = await import('./goalAlert');
    goal.warmUpGoalAudio();
    expect(audio.resume).toHaveBeenCalled();
    expect(goal.playGoalAlert()).toBe(false);
    expect(audio.createOscillator).not.toHaveBeenCalled();
    audio.state = 'running';
    expect(goal.playGoalAlert()).toBe(true);
  });
  it('fails silently when Web Audio is unavailable or interrupted', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const goal = await import('./goalAlert');
    expect(goal.playGoalAlert()).toBe(false);
    expect(() => goal.warmUpGoalAudio()).not.toThrow();
  });
});
