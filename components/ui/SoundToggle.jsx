'use client';

import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundEnabled, playSound, setSoundEnabled, subscribeSoundPreference } from '@/lib/sound/uiSound';

const serverSnapshot = () => true;

/** Header switch for UI sounds + haptics (persisted, synced across tabs). */
export default function SoundToggle({ className = '' }) {
  const enabled = useSyncExternalStore(subscribeSoundPreference, isSoundEnabled, serverSnapshot);

  const toggle = () => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) playSound('toggle');
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      data-sound="none"
      onClick={toggle}
      title={enabled ? 'Mute interface sounds' : 'Enable interface sounds'}
      aria-label={enabled ? 'Mute interface sounds' : 'Enable interface sounds'}
      className={`tactile flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-navy-750 bg-navy-900 text-lime-500 shadow-sm hover:border-lime-500/50 hover:bg-lime-500/10 ${className}`}
    >
      {enabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4 opacity-70" aria-hidden="true" />}
    </button>
  );
}
