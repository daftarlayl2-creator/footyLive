'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { isSoundEnabled, playSound, setSoundEnabled, subscribeSoundPreference } from '@/lib/sound/uiSound';
import { isGoalAlertEnabled, playGoalAlert, setGoalAlertEnabled, subscribeGoalAlertPreference, warmUpGoalAudio } from '@/lib/sound/goalAlert';

const serverSnapshot = () => true;

/** Independent, persisted sound controls; no notification permission needed for audio. */
export default function SoundToggle({ className = '' }) {
  const enabled = useSyncExternalStore(subscribeSoundPreference, isSoundEnabled, serverSnapshot);
  const goals = useSyncExternalStore(subscribeGoalAlertPreference, isGoalAlertEnabled, serverSnapshot);
  const panel = useRef(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !panel.current?.contains(event.target))) {
        if (panel.current) panel.current.open = false;
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <details ref={panel} className={`relative ${className}`} data-sound="none">
      <summary aria-label="Sound settings" title="Sound settings" className="tactile flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-navy-750 bg-navy-900 text-lime-500 shadow-sm hover:border-lime-500/50 [&::-webkit-details-marker]:hidden">
        {enabled || goals ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
      </summary>
      <div className="fixed right-4 top-[calc(4rem+env(safe-area-inset-top))] z-[70] sm:absolute sm:right-0 sm:top-12 w-[min(280px,calc(100vw-2rem))] space-y-3 rounded-2xl border border-navy-750 bg-navy-950/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-xl" aria-label="Sound preferences">
        <h2 className="text-sm font-extrabold">Sound settings</h2>
        <button type="button" role="switch" aria-checked={enabled} aria-label={enabled ? 'Mute interface sounds' : 'Enable interface sounds'} onClick={() => {
          setSoundEnabled(!enabled);
          if (!enabled) playSound('toggle');
        }} className="tactile flex w-full items-center justify-between gap-3 rounded-xl border border-navy-750 p-3 text-left text-xs font-bold">
          Interface sounds &amp; haptics <span className="text-lime-400">{enabled ? 'On' : 'Off'}</span>
        </button>
        <button type="button" role="switch" aria-checked={goals} aria-label="Retro goal alerts" onClick={() => {
          setGoalAlertEnabled(!goals);
          if (!goals) warmUpGoalAudio();
          setFeedback('');
        }} className="tactile flex w-full items-center justify-between gap-3 rounded-xl border border-navy-750 p-3 text-left text-xs font-bold">
          Retro GOOOAL! alerts <span className="text-lime-400">{goals ? 'On' : 'Off'}</span>
        </button>
        <p className="text-[11px] leading-relaxed text-zinc-400">A warm, synthesised broadcast-style goal cheer for starred teams and the match you’re watching. Tap once to unlock browser audio.</p>
        <button type="button" disabled={!goals} onClick={async () => {
          warmUpGoalAudio();
          // Give a gesture-initiated AudioContext.resume() a moment to settle.
          await new Promise((resolve) => setTimeout(resolve, 80));
          setFeedback(playGoalAlert() ? 'GOOOAL! Sound test played.' : 'Audio unavailable or still playing. Try again in a moment.');
        }} className="tactile inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime-500 p-2.5 text-xs font-extrabold text-navy-950 disabled:cursor-not-allowed disabled:opacity-40">
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Test goal sound
        </button>
        <p role="status" className="text-[11px] text-zinc-400">{feedback}</p>
      </div>
    </details>
  );
}
