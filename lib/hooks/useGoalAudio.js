'use client';

import { useEffect, useRef } from 'react';
import { playGoalAlert } from '@/lib/sound/goalAlert';
import { claimGoalAlert, isGoalIncrement } from '@/lib/sound/scoreChanges';

/** Feed all fixtures, not only filtered/visible ones, to monitor starred teams. */
export default function useGoalAudio(matches, isRelevant) {
  const previous = useRef(new Map());
  useEffect(() => {
    const next = new Map();
    for (const match of matches) {
      const id = String(match.id);
      const before = previous.current.get(id);
      if (isGoalIncrement(before, match) && isRelevant(match) && claimGoalAlert(id, match)) {
        playGoalAlert();
      }
      next.set(id, { status: match.status, homeScore: match.homeScore, awayScore: match.awayScore });
    }
    previous.current = next;
  }, [matches, isRelevant]);
}
