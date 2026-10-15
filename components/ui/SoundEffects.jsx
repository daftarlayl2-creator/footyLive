'use client';

import { useEffect } from 'react';
import { playSound, warmUpSound } from '@/lib/sound/uiSound';

/**
 * App-wide tactile audio. One delegated listener gives every button, link and
 * tab an instant click sound (plus a haptic tick on phones) — so a tap always
 * feels registered, even while the next screen's data is still loading.
 *
 * Opt-outs / overrides, declared in markup:
 *   data-sound="vote"   play a specific preset instead of the default
 *   data-sound="none"   silence this element (and everything inside it)
 *
 * `click` (not `pointerdown`) is used so starting a scroll gesture on a card
 * never makes a sound; the AudioContext is warmed up on pointerdown so the
 * first click is not delayed by context creation.
 */

const INTERACTIVE =
  'button, a[href], summary, select, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], input[type="checkbox"], input[type="radio"], [data-sound]';

const KNOWN = new Set(['tap', 'tab', 'toggle', 'vote', 'send', 'pop', 'success', 'error']);

export function soundForElement(element) {
  if (!element || typeof element.closest !== 'function') return null;
  const target = element.closest(INTERACTIVE);
  if (!target) return null;
  if (target.matches(':disabled, [aria-disabled="true"]')) return null;

  // An element's own data-sound wins; otherwise a silenced ancestor region mutes it.
  const explicit = target.getAttribute('data-sound');
  if (explicit === 'none') return null;
  if (explicit && KNOWN.has(explicit)) return explicit;
  if (target.parentElement?.closest('[data-sound="none"]')) return null;

  const role = target.getAttribute('role');
  if (role === 'tab') return 'tab';
  if (role === 'switch' || target.matches('input[type="checkbox"], input[type="radio"]')) return 'toggle';
  return 'tap';
}

export default function SoundEffects() {
  useEffect(() => {
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      warmUpSound();
    };

    const onClick = (event) => {
      const name = soundForElement(event.target instanceof Element ? event.target : null);
      if (name) playSound(name);
    };

    document.addEventListener('pointerdown', warm, { capture: true, passive: true });
    document.addEventListener('keydown', warm, { capture: true, passive: true });
    document.addEventListener('click', onClick, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', warm, { capture: true });
      document.removeEventListener('keydown', warm, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  return null;
}
