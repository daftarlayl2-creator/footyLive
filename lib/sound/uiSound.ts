/**
 * Tactile UI feedback for EVIV Live: tiny synthesised sounds + haptics.
 *
 * Every sound is generated on the fly with the Web Audio API — there are no
 * audio files to download, decode or cache — so feedback is scheduled within a
 * few milliseconds of the tap, even while the network is busy loading data.
 *
 * The engine is environment-injected (`createUiSound(env)`) so it can be unit
 * tested with fakes; the browser singleton below is lazy and SSR-safe: nothing
 * touches `window` until the first sound is requested.
 *
 * A single preference (`localStorage['eviv:sound']`, `'off'` to mute) controls
 * both sound and haptics, and is shared across tabs.
 */

export type UiSoundName = 'tap' | 'tab' | 'toggle' | 'vote' | 'send' | 'pop' | 'success' | 'error';

type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface ToneSpec {
  type: Wave;
  /** Start frequency (Hz). */
  freq: number;
  /** Optional end frequency for a short pitch glide (Hz). */
  to?: number;
  /** Offset from the trigger time (seconds). */
  at?: number;
  /** Tone length including the decay tail (seconds). */
  dur: number;
  /** Peak gain, 0–1. UI ticks stay deliberately quiet. */
  gain: number;
}

export interface SoundPreset {
  tones: ToneSpec[];
  /** `navigator.vibrate` pattern for touch devices. */
  haptic?: number | number[];
}

/** Hand-tuned presets: short, soft and pitched so they never clash. */
export const SOUND_PRESETS: Record<UiSoundName, SoundPreset> = {
  // Crisp downward "tick" — generic button / link press.
  tap: { tones: [{ type: 'triangle', freq: 1600, to: 520, dur: 0.035, gain: 0.05 }], haptic: 6 },
  // Soft two-step blip (a fifth apart) — tab / segment switches.
  tab: {
    tones: [
      { type: 'sine', freq: 740, dur: 0.05, gain: 0.05 },
      { type: 'sine', freq: 1110, at: 0.035, dur: 0.06, gain: 0.04 },
    ],
    haptic: 8,
  },
  // Upward glide — switches and toggles.
  toggle: { tones: [{ type: 'sine', freq: 520, to: 880, dur: 0.07, gain: 0.05 }], haptic: 8 },
  // Bright rising C-major arpeggio — a vote has been registered.
  vote: {
    tones: [
      { type: 'triangle', freq: 1046.5, dur: 0.09, gain: 0.05 },
      { type: 'triangle', freq: 1318.5, at: 0.06, dur: 0.09, gain: 0.05 },
      { type: 'triangle', freq: 1568, at: 0.12, dur: 0.16, gain: 0.055 },
    ],
    haptic: [12, 40, 18],
  },
  // Quick "whoosh-pip" — a chat message left the device.
  send: { tones: [{ type: 'sine', freq: 420, to: 1250, dur: 0.12, gain: 0.05 }], haptic: 10 },
  // Bubble pop — emoji reactions.
  pop: { tones: [{ type: 'sine', freq: 260, to: 720, dur: 0.06, gain: 0.07 }], haptic: 8 },
  // Two-note confirmation.
  success: {
    tones: [
      { type: 'sine', freq: 784, dur: 0.08, gain: 0.05 },
      { type: 'sine', freq: 1046.5, at: 0.07, dur: 0.14, gain: 0.05 },
    ],
    haptic: [10, 30, 10],
  },
  // Low, short buzz — something failed.
  error: { tones: [{ type: 'square', freq: 196, to: 150, dur: 0.14, gain: 0.025 }], haptic: [20, 40, 20] },
};

export const SOUND_PREF_KEY = 'eviv:sound';
/** The same sound never re-triggers faster than this (ms) — rapid taps stay clean. */
export const MIN_REPEAT_MS = 35;
/** Hard cap on simultaneously sounding oscillators. */
export const MAX_VOICES = 12;

/* -------------------------------------------------------------------------- */
/*  Minimal structural types (real Web Audio objects satisfy them)            */
/* -------------------------------------------------------------------------- */

export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface OscillatorLike {
  type: string;
  frequency: AudioParamLike;
  connect(node: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
  disconnect?(): void;
  onended: unknown;
}

export interface GainLike {
  gain: AudioParamLike;
  connect(node: unknown): unknown;
  disconnect?(): void;
}

export interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<unknown>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SoundEnvironment {
  createContext(): AudioContextLike | null;
  storage(): PreferenceStorage | null;
  vibrate?(pattern: number | number[]): void;
  /** Monotonic clock in milliseconds. */
  now(): number;
  /** Subscribe to preference changes made in other tabs. */
  listenExternal?(onChange: () => void): () => void;
}

export interface UiSoundEngine {
  play(name: UiSoundName): boolean;
  /** Create / resume the AudioContext ahead of the first sound (call on pointerdown). */
  warmUp(): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                     */
/* -------------------------------------------------------------------------- */

const SILENCE = 0.0001;

export function createUiSound(env: SoundEnvironment): UiSoundEngine {
  let ctx: AudioContextLike | null = null;
  let master: GainLike | null = null;
  let activeVoices = 0;
  const lastPlayed = new Map<UiSoundName, number>();
  const listeners = new Set<() => void>();

  function isEnabled(): boolean {
    try {
      return env.storage()?.getItem(SOUND_PREF_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function setEnabled(enabled: boolean): void {
    try {
      env.storage()?.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off');
    } catch {
      // Private mode / quota — the in-session toggle still applies to listeners.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const stopExternal = env.listenExternal?.(listener);
    return () => {
      listeners.delete(listener);
      stopExternal?.();
    };
  }

  function ensureContext(): AudioContextLike | null {
    if (!ctx) {
      try {
        ctx = env.createContext();
      } catch {
        ctx = null;
      }
      if (!ctx) return null;
      master = ctx.createGain();
      master.gain.setValueAtTime(0.9, ctx.currentTime);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      // Browsers start contexts suspended until a user gesture; we are inside one.
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function scheduleTone(audio: AudioContextLike, out: GainLike, tone: ToneSpec, base: number): void {
    const start = base + (tone.at ?? 0);
    const end = start + tone.dur;
    const osc = audio.createOscillator();
    const amp = audio.createGain();

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to && tone.to > 0) osc.frequency.exponentialRampToValueAtTime(tone.to, end);

    // 4 ms attack, exponential decay: click-free and very short.
    amp.gain.setValueAtTime(SILENCE, start);
    amp.gain.linearRampToValueAtTime(tone.gain, start + 0.004);
    amp.gain.exponentialRampToValueAtTime(SILENCE, end);

    osc.connect(amp);
    amp.connect(out);

    activeVoices += 1;
    osc.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      try {
        osc.disconnect?.();
        amp.disconnect?.();
      } catch {
        // Already disconnected.
      }
    };
    osc.start(start);
    osc.stop(end + 0.02);
  }

  function play(name: UiSoundName): boolean {
    const preset = SOUND_PRESETS[name];
    if (!preset || !isEnabled()) return false;

    const now = env.now();
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < MIN_REPEAT_MS) return false;
    if (activeVoices + preset.tones.length > MAX_VOICES) return false;
    lastPlayed.set(name, now);

    if (preset.haptic !== undefined) {
      try {
        env.vibrate?.(preset.haptic);
      } catch {
        // Vibration is best-effort.
      }
    }

    const audio = ensureContext();
    if (!audio || !master) return false;
    const base = audio.currentTime + 0.005;
    for (const tone of preset.tones) scheduleTone(audio, master, tone, base);
    return true;
  }

  function warmUp(): void {
    if (isEnabled()) ensureContext();
  }

  return { play, warmUp, isEnabled, setEnabled, subscribe };
}

/* -------------------------------------------------------------------------- */
/*  Browser singleton                                                          */
/* -------------------------------------------------------------------------- */

function browserEnvironment(): SoundEnvironment {
  return {
    createContext() {
      if (typeof window === 'undefined') return null;
      const w = window as unknown as {
        AudioContext?: new (options?: { latencyHint?: string }) => unknown;
        webkitAudioContext?: new (options?: { latencyHint?: string }) => unknown;
      };
      const Ctor = w.AudioContext || w.webkitAudioContext;
      return Ctor ? (new Ctor({ latencyHint: 'interactive' }) as AudioContextLike) : null;
    },
    storage() {
      try {
        return typeof window !== 'undefined' ? window.localStorage : null;
      } catch {
        return null;
      }
    },
    vibrate(pattern) {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
      // Only phones/tablets: a desktop with a vibration API has no motor to buzz.
      if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches) return;
      navigator.vibrate(pattern);
    },
    now() {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    },
    listenExternal(onChange) {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key === SOUND_PREF_KEY) onChange();
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

let engine: UiSoundEngine | null = null;

function getEngine(): UiSoundEngine {
  if (!engine) engine = createUiSound(browserEnvironment());
  return engine;
}

/** Play a UI sound (and matching haptic). Safe to call anywhere; no-ops on the server. */
export function playSound(name: UiSoundName): boolean {
  if (typeof window === 'undefined') return false;
  return getEngine().play(name);
}

export function warmUpSound(): void {
  if (typeof window === 'undefined') return;
  getEngine().warmUp();
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return getEngine().isEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  getEngine().setEnabled(enabled);
}

export function subscribeSoundPreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  return getEngine().subscribe(listener);
}
