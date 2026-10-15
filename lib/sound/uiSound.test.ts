import { describe, expect, it, vi } from 'vitest';
import {
  createUiSound,
  MAX_VOICES,
  MIN_REPEAT_MS,
  SOUND_PREF_KEY,
  SOUND_PRESETS,
  type AudioContextLike,
  type SoundEnvironment,
} from './uiSound';

function fakeParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function fakeContext(state = 'running') {
  const oscillators: any[] = [];
  const ctx = {
    currentTime: 10,
    state,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine',
        frequency: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as null | (() => void),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() })),
  };
  return { ctx: ctx as unknown as AudioContextLike & { state: string }, oscillators, raw: ctx };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function setup(options: { storage?: ReturnType<typeof memoryStorage>; state?: string } = {}) {
  const { ctx, oscillators, raw } = fakeContext(options.state);
  let clock = 1000;
  const vibrate = vi.fn();
  const storage = options.storage ?? memoryStorage();
  const createContext = vi.fn(() => ctx);
  const env: SoundEnvironment = {
    createContext,
    storage: () => storage,
    vibrate,
    now: () => clock,
  };
  const engine = createUiSound(env);
  return {
    engine,
    oscillators,
    raw,
    vibrate,
    storage,
    createContext,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('ui sound engine', () => {
  it('synthesises every tone of a preset with a click-free envelope', () => {
    const { engine, oscillators, vibrate } = setup();
    expect(engine.play('vote')).toBe(true);

    expect(oscillators).toHaveLength(SOUND_PRESETS.vote.tones.length);
    const [first, second] = oscillators;
    expect(first.type).toBe('triangle');
    expect(first.frequency.setValueAtTime).toHaveBeenCalledWith(1046.5, expect.any(Number));
    // Second note of the arpeggio is scheduled later than the first.
    expect(second.start.mock.calls[0][0]).toBeGreaterThan(first.start.mock.calls[0][0]);
    for (const osc of oscillators) {
      expect(osc.stop.mock.calls[0][0]).toBeGreaterThan(osc.start.mock.calls[0][0]);
    }
    expect(vibrate).toHaveBeenCalledWith(SOUND_PRESETS.vote.haptic);
  });

  it('applies a pitch glide only to tones that declare one', () => {
    const { engine, oscillators } = setup();
    engine.play('tap');
    expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(520, expect.any(Number));
  });

  it('reuses a single AudioContext and resumes it when the browser suspended it', () => {
    const { engine, createContext, raw, advance } = setup({ state: 'suspended' });
    engine.play('tap');
    expect(raw.resume).toHaveBeenCalledTimes(1);
    advance(100);
    engine.play('tab');
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('throttles the same sound so rapid taps never stack up', () => {
    const { engine, oscillators, advance } = setup();
    expect(engine.play('tap')).toBe(true);
    expect(engine.play('tap')).toBe(false);
    advance(MIN_REPEAT_MS + 1);
    expect(engine.play('tap')).toBe(true);
    expect(oscillators).toHaveLength(2);
  });

  it('caps simultaneous voices and frees them when oscillators end', () => {
    const { engine, oscillators, advance } = setup();
    let played = 0;
    for (let i = 0; i < 20; i += 1) {
      if (engine.play('vote')) played += 1;
      advance(MIN_REPEAT_MS + 1);
    }
    expect(oscillators.length).toBeLessThanOrEqual(MAX_VOICES);
    expect(played).toBe(Math.floor(MAX_VOICES / SOUND_PRESETS.vote.tones.length));

    for (const osc of oscillators) osc.onended?.();
    expect(engine.play('vote')).toBe(true);
  });

  it('respects the persisted mute preference and notifies subscribers', () => {
    const storage = memoryStorage({ [SOUND_PREF_KEY]: 'off' });
    const { engine, oscillators, vibrate } = setup({ storage });
    expect(engine.isEnabled()).toBe(false);
    expect(engine.play('tap')).toBe(false);
    expect(oscillators).toHaveLength(0);
    expect(vibrate).not.toHaveBeenCalled();

    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    engine.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.getItem(SOUND_PREF_KEY)).toBe('on');
    expect(engine.play('tap')).toBe(true);
    unsubscribe();
    engine.setEnabled(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('degrades silently when Web Audio is unavailable', () => {
    const engine = createUiSound({ createContext: () => null, storage: () => null, now: () => 0 });
    expect(engine.isEnabled()).toBe(true);
    expect(engine.play('tap')).toBe(false);
    expect(() => engine.warmUp()).not.toThrow();
  });
});
