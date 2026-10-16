'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { playSoundboardSound } from '@/lib/sound/soundboard';
import { isSoundEnabled, setSoundEnabled, subscribeSoundPreference } from '@/lib/sound/uiSound';

/**
 * Match Soundboard & Live Reactions — floating bubbles over the live stream.
 *
 * Four reactions (🔥 Fire, ⚽ Goal Cheer, 📣 Whistle, 🍋 Lemon Vibe) float up
 * over the player stage and move shared, real-time counters (`/api/reactions`).
 * Each tap plays its stadium sound from the match soundboard and haptics; the
 * counters poll while the tab is visible and refresh instantly on a tap. All
 * animation handles and intervals are cleaned up on unmount.
 */

/** One seed per reaction kind — the idiom this repo uses for stable SSR output. */
const REACTIONS = [
  { kind: 'fire', emoji: '🔥', label: 'Fire' },
  { kind: 'goalCheer', emoji: '⚽', label: 'Goal Cheer' },
  { kind: 'whistle', emoji: '📣', label: 'Whistle' },
  { kind: 'lemonVibe', emoji: '🍋', label: 'Lemon Vibe' },
];

const EMPTY = { fire: 0, goalCheer: 0, whistle: 0, lemonVibe: 0 };
const POLL_MS = 20_000;
const BUBBLE_LIFE_MS = 2_200;
/** Deterministic lane positions for bubbles (% of stage width) — hydration-safe. */
const LANES = [12, 30, 48, 66, 84];

function formatCount(value) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

/**
 * Floating reaction bubbles over a live stream. `matchId` scopes the shared
 * counters; `compact` shrinks the rail for Multi-View tiles.
 */
export default function LiveReactions({ matchId, compact = false }) {
  const [counts, setCounts] = useState(EMPTY);
  const [bubbles, setBubbles] = useState([]);
  // Shared UI-sound preference store: hydration-safe (server snapshot `true`),
  // cross-tab live, and it mutes every interface sound at once.
  const soundOn = useSyncExternalStore(subscribeSoundPreference, isSoundEnabled, () => true);
  const loadedRef = useRef(false);
  const bubbleSeq = useRef(0);

  const loadCounts = useCallback(async () => {
    if (!matchId) return;
    try {
      const response = await fetch(`/api/reactions/${encodeURIComponent(matchId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.counts) setCounts({ ...EMPTY, ...data.counts });
    } catch {
      /* offline: keep the last known tallies */
    }
  }, [matchId]);

  // Live counters: one fetch on mount, then a visible-tab poll — always cleaned.
  useEffect(() => {
    if (!matchId) return undefined;
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadCounts();
    }
    const id = setInterval(() => { if (!document.hidden) void loadCounts(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void loadCounts(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [matchId, loadCounts]);

  const react = (reaction) => {
    // Floating bubble (local, instant).
    const id = `bubble-${bubbleSeq.current += 1}`;
    const lane = LANES[bubbleSeq.current % LANES.length];
    setBubbles((current) => [...current.slice(-14), { id, kind: reaction.kind, emoji: reaction.emoji, lane }]);
    setTimeout(() => {
      setBubbles((current) => current.filter((bubble) => bubble.id !== id));
    }, BUBBLE_LIFE_MS);

    // Match soundboard tone (respects the shared sound preference).
    if (soundOn) playSoundboardSound(reaction.kind);

    // Optimistic counter + server tally (throttled server-side per viewer).
    setCounts((current) => ({ ...current, [reaction.kind]: (current[reaction.kind] || 0) + 1 }));
    if (!matchId) return;
    fetch(`/api/reactions/${encodeURIComponent(matchId)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: reaction.kind }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.counts) setCounts({ ...EMPTY, ...data.counts });
      })
      .catch(() => {
        /* the local tap already animated; the shared tally syncs on the next poll */
      });
  };

  return (
    <div
      className={`pointer-events-none absolute z-20 ${compact ? 'inset-x-2 top-2' : 'inset-x-3 top-3'}`}
      data-live-reactions=""
      data-live-reactions-match={matchId || ''}
      aria-label="Live reactions"
    >
      {/* Floating bubbles */}
      <div className="absolute right-2 bottom-2 top-2 w-14 overflow-hidden" aria-hidden="true">
        {bubbles.map((bubble) => (
          <span
            key={bubble.id}
            data-reaction-bubble={bubble.kind}
            className="reaction-bubble absolute text-2xl"
            style={{ left: `${bubble.lane}%`, bottom: 0 }}
          >
            {bubble.emoji}
          </span>
        ))}
      </div>

      {/* Soundboard + counters rail */}
      <div className={`pointer-events-auto ml-auto flex w-fit flex-col items-end gap-1.5 rounded-2xl border border-white/10 bg-black/55 p-1.5 backdrop-blur-md ${compact ? 'scale-90 origin-top-right' : ''}`}>
        <div className="flex items-center gap-1">
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.kind}
              type="button"
              onClick={() => react(reaction)}
              title={reaction.label}
              aria-label={`${reaction.label} reaction`}
              data-reaction-button={reaction.kind}
              className="group flex cursor-pointer flex-col items-center rounded-xl px-1.5 py-1 transition-transform hover:bg-white/10 active:scale-90"
            >
              <span className="text-lg leading-none">{reaction.emoji}</span>
              <span className="mt-0.5 text-[9px] font-black tabular-nums text-zinc-200" data-reaction-count={reaction.kind}>
                {formatCount(counts[reaction.kind])}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundOn)}
            title={soundOn ? 'Mute match soundboard' : 'Unmute match soundboard'}
            aria-label={soundOn ? 'Mute match soundboard' : 'Unmute match soundboard'}
            aria-pressed={!soundOn}
            data-soundboard-toggle=""
            className="ml-0.5 cursor-pointer rounded-xl border border-white/10 p-1.5 text-zinc-300 transition-colors hover:border-lime-400/40 hover:text-lime-200"
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </div>
        {!compact && (
          <p className="px-1 text-[8.5px] font-bold uppercase tracking-wider text-zinc-400">Match soundboard · live</p>
        )}
      </div>
    </div>
  );
}
