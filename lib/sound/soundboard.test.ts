import { describe, expect, it, vi } from 'vitest';
import {
  SOUNDBOARD_MIN_REPEAT_MS,
  createSoundboard,
  type AudioContextLike,
  type SoundboardEnv,
} from './soundboard';

/** Fake Web Audio context that records every scheduled node. */
function fakeAudio() {
  const events: string[] = [];
  const gain = () => ({
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  });
  const ctx: AudioContextLike = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => {}),
    createGain: () => {
      events.push('gain');
      return gain();
    },
    createOscillator: () => {
      events.push('tone');
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    createBiquadFilter: () => {
      events.push('filter');
      return {
        type: 'bandpass',
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    },
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      events.push('noise');
      return { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    },
  };
  return { ctx, events };
}

function envWith(overrides: Partial<SoundboardEnv> = {}): SoundboardEnv {
  const { ctx } = fakeAudio();
  return {
    now: () => 0,
    storage: { getItem: () => 'on' },
    createAudioContext: () => ctx,
    ...overrides,
  };
}

describe('match soundboard synth', () => {
  it('schedules a noise whoosh for Fire and a crowd swell for Goal Cheer', () => {
    const a = fakeAudio();
    createSoundboard({ now: () => 0, storage: null, createAudioContext: () => a.ctx }).play('fire');
    expect(a.events).toContain('noise');
    expect(a.events).toContain('filter');

    const b = fakeAudio();
    createSoundboard({ now: () => 0, storage: null, createAudioContext: () => b.ctx }).play('goalCheer');
    expect(b.events).toContain('noise');
    expect(b.events).toContain('tone');
  });

  it('schedules tones for Whistle and the Lemon Vibe arpeggio', () => {
    const whistle = fakeAudio();
    createSoundboard({ now: () => 0, storage: null, createAudioContext: () => whistle.ctx }).play('whistle');
    expect(whistle.events.filter((e) => e === 'tone').length).toBeGreaterThanOrEqual(3);
    expect(whistle.events).not.toContain('noise');

    const lemon = fakeAudio();
    createSoundboard({ now: () => 0, storage: null, createAudioContext: () => lemon.ctx }).play('lemonVibe');
    expect(lemon.events.filter((e) => e === 'tone').length).toBeGreaterThanOrEqual(4);
  });

  it('respects the shared mute switch and throttles rapid repeats', () => {
    const muted = fakeAudio();
    const engine = createSoundboard({ now: () => 0, storage: { getItem: () => 'off' }, createAudioContext: () => muted.ctx });
    expect(engine.play('fire')).toBe(false);
    expect(muted.events).toHaveLength(0);

    let clock = 1000;
    const active = fakeAudio();
    const throttled = createSoundboard({ now: () => clock, storage: { getItem: () => 'on' }, createAudioContext: () => active.ctx });
    expect(throttled.play('whistle')).toBe(true);
    clock += SOUNDBOARD_MIN_REPEAT_MS - 1;
    expect(throttled.play('whistle')).toBe(false);
    clock += 1;
    expect(throttled.play('whistle')).toBe(true);
    // A different reaction is never blocked.
    expect(throttled.play('fire')).toBe(true);
  });

  it('vibrates on goal cheers and degrades to silence without Web Audio', () => {
    const vibrate = vi.fn();
    const a = fakeAudio();
    const engine = createSoundboard({ now: () => 0, storage: null, vibrate, createAudioContext: () => a.ctx });
    engine.play('goalCheer');
    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);

    const broken = createSoundboard({
      now: () => 0,
      storage: null,
      createAudioContext: () => { throw new Error('no audio'); },
    });
    expect(broken.play('fire')).toBe(false);
    expect(envWith().createAudioContext).toBeTruthy();
  });
});
