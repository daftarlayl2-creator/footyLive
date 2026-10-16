/**
 * Match Soundboard — synthesised stadium-style reaction sounds.
 *
 * Four tones for the four live reactions (Fire, Goal Cheer, Whistle, Lemon
 * Vibe), generated on the fly with the Web Audio API — no audio files to
 * download or decode. The engine is environment-injected (`createSoundboard`)
 * so it is unit-testable; the browser singleton is lazy and SSR-safe, and the
 * shared UI-sound preference (`localStorage['eviv:sound']`) mutes it like
 * every other interface sound.
 */

export type SoundboardName = 'fire' | 'goalCheer' | 'whistle' | 'lemonVibe';

/** Minimal Web Audio surface the soundboard needs (fakeable in tests). */
export interface AudioGainLike {
  gain: {
    value: number;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
  };
  connect(target: unknown): void;
}

export interface AudioOscillatorLike {
  type: string;
  frequency: {
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
  };
  connect(target: unknown): void;
  start(time?: number): void;
  stop(time?: number): void;
}

export interface AudioFilterLike {
  type: string;
  frequency: {
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
  };
  connect(target: unknown): void;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceLike {
  buffer: AudioBufferLike | null;
  connect(target: unknown): void;
  start(time?: number): void;
  stop(time?: number): void;
}

export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  state?: string;
  destination: unknown;
  resume?(): Promise<void>;
  createGain(): AudioGainLike;
  createOscillator(): AudioOscillatorLike;
  createBiquadFilter(): AudioFilterLike;
  createBuffer(channels: number, length: number, rate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceLike;
}

export interface SoundboardEnv {
  now: () => number;
  storage: { getItem(key: string): string | null } | null;
  vibrate?: (pattern: number | number[]) => void;
  createAudioContext: () => AudioContextLike;
}

export const SOUNDBOARD_PREF_KEY = 'eviv:sound';
/** One reaction sound never re-triggers faster than this (ms). */
export const SOUNDBOARD_MIN_REPEAT_MS = 250;

export interface SoundboardEngine {
  play(name: SoundboardName): boolean;
}

function isEnabled(storage: SoundboardEnv['storage']): boolean {
  try {
    return (storage?.getItem(SOUNDBOARD_PREF_KEY) ?? 'on') !== 'off';
  } catch {
    return true;
  }
}

/** Short noise burst ("whoosh"/crowd bed) built from a generated buffer. */
function noiseBurst(
  ctx: AudioContextLike,
  master: AudioGainLike,
  { dur, fromHz, toHz, gain, at = 0 }: { dur: number; fromHz: number; toHz: number; gain: number; at?: number }
): void {
  const t = ctx.currentTime + at;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    // White noise with a soft fade-out tail.
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(fromHz, t);
  filter.frequency.linearRampToValueAtTime(toHz, t + dur);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, t);
  envelope.gain.linearRampToValueAtTime(0.0001, t + dur);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master);
  source.start(t);
  source.stop(t + dur + 0.05);
}

function tone(
  ctx: AudioContextLike,
  master: AudioGainLike,
  { type, freq, to, dur, gain, at = 0 }: { type: string; freq: number; to?: number; dur: number; gain: number; at?: number }
): void {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, t);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(envelope);
  envelope.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function createSoundboard(env: SoundboardEnv): SoundboardEngine {
  let ctx: AudioContextLike | null = null;
  let master: AudioGainLike | null = null;
  const lastPlayed: Record<string, number> = {};

  const ensure = (): { ctx: AudioContextLike; master: AudioGainLike } | null => {
    if (!isEnabled(env.storage)) return null;
    if (!ctx) {
      try {
        ctx = env.createAudioContext();
        master = ctx.createGain();
        master.gain.value = 0.75;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
        master = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
    return ctx && master ? { ctx, master } : null;
  };

  return {
    play(name: SoundboardName): boolean {
      const engine = ensure();
      if (!engine) return false;
      const now = env.now();
      if (now - (lastPlayed[name] ?? -Infinity) < SOUNDBOARD_MIN_REPEAT_MS) return false;
      lastPlayed[name] = now;
      const { ctx: audio, master: bus } = engine;

      if (name === 'fire') {
        // Whoosh: bandpass-swept noise up then down.
        noiseBurst(audio, bus, { dur: 0.55, fromHz: 220, toHz: 1600, gain: 0.16 });
        noiseBurst(audio, bus, { dur: 0.35, fromHz: 1400, toHz: 320, gain: 0.1, at: 0.18 });
      } else if (name === 'goalCheer') {
        // Crowd swell + rising "goooal" tone pair.
        noiseBurst(audio, bus, { dur: 1.1, fromHz: 500, toHz: 1400, gain: 0.18 });
        tone(audio, bus, { type: 'triangle', freq: 320, to: 660, dur: 0.9, gain: 0.12, at: 0.12 });
        tone(audio, bus, { type: 'sine', freq: 480, to: 990, dur: 0.8, gain: 0.08, at: 0.22 });
      } else if (name === 'whistle') {
        // Referee trill: two tight square pulses with a quick glide.
        tone(audio, bus, { type: 'square', freq: 2100, to: 2350, dur: 0.12, gain: 0.07 });
        tone(audio, bus, { type: 'square', freq: 2350, to: 2050, dur: 0.12, gain: 0.07, at: 0.16 });
        tone(audio, bus, { type: 'square', freq: 2150, dur: 0.22, gain: 0.06, at: 0.32 });
      } else {
        // Lemon vibe: bright C-major arpeggio with a shimmer tail.
        tone(audio, bus, { type: 'triangle', freq: 1046.5, dur: 0.16, gain: 0.09 });
        tone(audio, bus, { type: 'triangle', freq: 1318.5, dur: 0.16, gain: 0.09, at: 0.1 });
        tone(audio, bus, { type: 'triangle', freq: 1568, dur: 0.28, gain: 0.1, at: 0.2 });
        tone(audio, bus, { type: 'sine', freq: 2093, dur: 0.35, gain: 0.05, at: 0.32 });
      }

      if (typeof env.vibrate === 'function') env.vibrate(name === 'goalCheer' ? [12, 40, 18] : 8);
      return true;
    },
  };
}

/* Lazy browser singleton — nothing touches `window` until the first play. */
let browserEngine: SoundboardEngine | null = null;

export function playSoundboardSound(name: SoundboardName): boolean {
  if (typeof window === 'undefined') return false;
  if (!browserEngine) {
    browserEngine = createSoundboard({
      now: () => Date.now(),
      storage: window.localStorage,
      vibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? (p) => navigator.vibrate(p) : undefined,
      createAudioContext: () => {
        const Ctor = (window as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }).AudioContext
          || (window as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;
        if (!Ctor) throw new Error('Web Audio unavailable');
        return new Ctor();
      },
    });
  }
  return browserEngine.play(name);
}

/** Test helper: drops the cached engine. */
export function resetSoundboardForTests(): void {
  browserEngine = null;
}
