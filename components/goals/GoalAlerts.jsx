'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';

/**
 * Goal Alerts - Web Notification API integration.
 *
 * "🔔 Enable Goal Alerts" button. Requests notification permission when clicked
 * and fires a desktop/mobile notification when a goal is scored.
 */
export default function GoalAlerts({ matchId, homeTeam, awayTeam, homeScore = 0, awayScore = 0 }) {
  const [enabled, setEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const prevScores = useRef({ homeScore, awayScore });

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

  // Watch for live score increments once alerts are enabled
  useEffect(() => {
    const prev = prevScores.current;
    if (enabled && notificationPermission === 'granted') {
      if (homeScore > prev.homeScore) {
        showGoalNotification(homeTeam?.name || 'Home', homeScore, awayScore);
      } else if (awayScore > prev.awayScore) {
        showGoalNotification(awayTeam?.name || 'Away', homeScore, awayScore);
      }
    }
    prevScores.current = { homeScore, awayScore };
  }, [awayScore, awayTeam?.name, enabled, homeScore, homeTeam?.name, notificationPermission, showGoalNotification]);

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
          title="Enable Goal Alerts"
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
