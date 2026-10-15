'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import useLiveMatch from '@/lib/hooks/useLiveMatch';
import useGoalAudio from '@/lib/hooks/useGoalAudio';
import { isGoalIncrement } from '@/lib/sound/scoreChanges';

/**
 * Goal Alerts - Web Notification API integration.
 *
 * "🔔 Enable Goal Alerts" button. Requests notification permission when clicked
 * and fires a desktop/mobile notification when a goal is scored.
 */
export default function GoalAlerts({ matchId, homeTeam, awayTeam, homeScore, awayScore, status = 'upcoming' }) {
  const [enabled, setEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const { data } = useLiveMatch(matchId, { homeScore, awayScore, status });
  useGoalAudio([{ id: matchId, ...data }], () => true);
  const prevScores = useRef({ matchId, ...data });

  const showGoalNotification = useCallback(
    (scoringTeam, nextHomeScore, nextAwayScore) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const title = '⚽ GOAL!';
      const body = `${scoringTeam} scored! ${homeTeam?.name || 'Home'} ${nextHomeScore} - ${nextAwayScore} ${awayTeam?.name || 'Away'}`;

      try {
        new Notification(title, {
          body,
          icon: '/icon.svg',
          tag: `eviv-goal-${matchId || 'match'}`,
        });
      } catch {
        // Ignore environments where the Notification constructor is restricted.
      }
    },
    [awayTeam?.name, homeTeam?.name, matchId]
  );

  // Notifications are opt-in separately; audio does not require this permission.
  useEffect(() => {
    const prev = prevScores.current;
    if (prev.matchId === matchId && enabled && notificationPermission === 'granted' && isGoalIncrement(prev, data)) {
      const scoringTeam = data.homeScore > prev.homeScore ? homeTeam?.name : awayTeam?.name;
      showGoalNotification(scoringTeam || 'Team', data.homeScore, data.awayScore);
    }
    prevScores.current = { matchId, ...data };
  }, [data, matchId, enabled, notificationPermission, homeTeam?.name, awayTeam?.name, showGoalNotification]);

  // Enable goal alerts on user click
  const enableAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    let current = Notification.permission;
    if (current === 'default') {
      try {
        current = await Notification.requestPermission();
      } catch {
        current = 'denied';
      }
    }
    setNotificationPermission(current);
    setEnabled(true);
  };

  if (notificationPermission === 'unsupported') {
    return null;
  }

  return (
    <div className="goal-alerts inline-flex items-center">
      {!enabled ? (
        <button
          type="button"
          onClick={enableAlerts}
          className="inline-flex items-center gap-1.5 rounded-lg bg-lime-500 px-3.5 py-1.5 text-xs font-bold text-navy-950 hover:bg-lime-400 transition-colors cursor-pointer shadow-sm"
          title="Enable desktop goal notifications (sound is controlled in Sound settings)"
        >
          <Bell className="h-3.5 w-3.5" />
          Enable Goal Alerts
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-lime-500/30 bg-lime-500/10 px-3 py-1.5 text-xs font-bold text-lime-400">
          <BellRing className="h-3.5 w-3.5" />
          Goal Alerts Active
        </span>
      )}
    </div>
  );
}
