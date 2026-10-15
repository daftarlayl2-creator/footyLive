/**
 * Retro "GOOOAL!" audio alert.
 *
 * Synthesised entirely with the Web Audio API (no audio files): a crowd-cheer
 * noise bed plus a formant-filtered, stretched “goooal” vowel and a brass
 * stinger inspired by 90s/2000s football broadcasts (not a sampled voice). Preference is persisted
 * separately from the UI-sound toggle so users can mute the fanfare while
 * keeping interface ticks.
 */

export const GOAL_ALERT_PREF_KEY = 'eviv:goal-alerts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sessionPreference: boolean | undefined;
let lastPlayed = -Infinity;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const w = window as unknown as {
        AudioContext?: new () => AudioContext;
        webkitAudioContext?: new () => AudioContext;
      };
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.setValueAtTime(0.85, ctx.currentTime);
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
      return null;
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isGoalAlertEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return sessionPreference ?? (window.localStorage.getItem(GOAL_ALERT_PREF_KEY) !== 'off');
  } catch {
    return sessionPreference ?? true;
  }
}

export function setGoalAlertEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  sessionPreference = enabled;
  try {
    window.localStorage.setItem(GOAL_ALERT_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private mode / quota — in-session toggle still applies to listeners.
  }
  try {
    window.dispatchEvent(new CustomEvent('goal-alert-pref-changed', { detail: enabled }));
  } catch {
    // ignore
  }
}

export function subscribeGoalAlertPreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === GOAL_ALERT_PREF_KEY || event.key === null) {
      sessionPreference = undefined;
      listener();
    }
  };
  const custom = () => listener();
  window.addEventListener('storage', handler);
  window.addEventListener('goal-alert-pref-changed', custom);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('goal-alert-pref-changed', custom);
  };
}

function scheduleTone(
  audio: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  to: number | undefined,
  at: number,
  dur: number,
  gain: number
): void {
  const start = at;
  const end = start + dur;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to && to > 0) osc.frequency.exponentialRampToValueAtTime(to, end);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(amp);
  amp.connect(out);
  osc.start(start);
  osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  osc.stop(end + 0.05);
}

/** Unlock on an intentional user gesture; never queue an old goal for later. */
export function warmUpGoalAudio(): void {
  if (isGoalAlertEnabled()) ensureContext();
}

export function playGoalAlert(): boolean {
  try {
    return synthesizeGoalAlert();
  } catch {
    // Audio can become unavailable when the OS interrupts or closes a context.
    return false;
  }
}

function synthesizeGoalAlert(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isGoalAlertEnabled()) return false;

  const audio = ensureContext();
  if (!audio || !master || audio.state !== 'running') return false;
  const stamp = performance.now();
  if (stamp - lastPlayed < 1800) return false;
  lastPlayed = stamp;

  const now = audio.currentTime + 0.01;

  // Crowd cheer: filtered white noise with a swell envelope.
  try {
    const duration = 1.6;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + duration);
    filter.Q.value = 0.9;
    const noiseGain = audio.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.32, now + 0.12);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
    noise.stop(now + duration + 0.05);
  } catch {
    // Noise bed is best-effort.
  }

  // A voiced, warm /o/ → /a/ vowel: harmonic source through speech formants.
  // Deliberately synthetic — no unlicensed commentary recordings or remote TTS.
  const voice = audio.createOscillator();
  voice.type = 'sawtooth';
  voice.frequency.setValueAtTime(165, now);
  voice.frequency.linearRampToValueAtTime(225, now + 0.15);
  voice.frequency.linearRampToValueAtTime(180, now + 1.35);
  const voiceGain = audio.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.linearRampToValueAtTime(0.65, now + 0.08);
  voiceGain.gain.setValueAtTime(0.55, now + 1.05);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  voiceGain.connect(master);
  const formants = [[450, 730, 1], [800, 1100, 0.7], [2600, 2500, 0.25]];
  const nodes: AudioNode[] = [voice, voiceGain];
  for (const [from, to, level] of formants) {
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.setValueAtTime(from, now + 0.85);
    filter.frequency.linearRampToValueAtTime(to, now + 1.2);
    const gain = audio.createGain();
    gain.gain.value = level;
    voice.connect(filter);
    filter.connect(gain);
    gain.connect(voiceGain);
    nodes.push(filter, gain);
  }
  voice.onended = () => nodes.forEach((node) => node.disconnect());
  voice.start(now);
  voice.stop(now + 1.55);

  // Short arcade-broadcast brass lift beneath the voiced vowel.
  scheduleTone(audio, master, 'sawtooth', 392, 784, now, 0.45, 0.045);
  scheduleTone(audio, master, 'square', 523.25, 1046.5, now + 0.08, 0.5, 0.035);
  scheduleTone(audio, master, 'triangle', 659.25, 1318.5, now + 0.18, 0.55, 0.035);

  // Major-chord stinger at the peak.
  const peak = now + 0.32;
  scheduleTone(audio, master, 'triangle', 523.25, undefined, peak, 0.4, 0.1);
  scheduleTone(audio, master, 'triangle', 659.25, undefined, peak, 0.4, 0.1);
  scheduleTone(audio, master, 'triangle', 783.99, undefined, peak, 0.4, 0.1);
  scheduleTone(audio, master, 'triangle', 1046.5, undefined, peak, 0.6, 0.12);

  return true;
}

