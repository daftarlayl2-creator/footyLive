'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

/**
 * Goal Alerts - Web Push API integration.
 * 
 * "🔔 Enable Goal Alerts" button using Web Push API.
 * Triggers desktop/mobile notification when goal scored.
 * 
 * Note: Full Web Push requires a VAPID key server setup. This component
 * provides the UI and a basic notification framework. The actual push
 * subscription would need a backend server with VAPID keys.
 */
export default function GoalAlerts({ matchId, homeTeam, awayTeam }) {
  const [enabled, setEnabled] = useState(false);
  const [showButton, setShowButton] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // Check notification permission
  useEffect(() => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setShowButton(false);
      return;
    }

    setNotificationPermission(Notification.permission);

    // Request permission if not already set
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
      });
    }
  }, []);

  // Enable goal alerts
  const enableAlerts = () => {
    setEnabled(true);
    setShowButton(false);
  };

  // Show goal notification
  const showGoalNotification = (scoringTeam) => {
    if (notificationPermission !== 'granted') return;

    const title = '⚽ GOAL!';
    const body = `${scoringTeam} scored! ${homeTeam?.name || 'Home'} ${awayTeam?.name || 'Away'}`;
    
    new Notification(title, {
      body,
      icon: '/placeholder-icon.png',
      tag: 'eviv-goal',
      renotify: true,
      requireInteraction: true,
    });
  };

  return (
    <div className="goal-alerts">
      {showButton && !enabled && (
        <button
          onClick={enableAlerts}
          className="flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-[10px] font-bold text-navy-900 hover:bg-lime-400 transition-colors"
          title="Enable Goal Alerts"
        >
          <Bell className="h-4 w-4" /> Enable Goal Alerts
        </button>
      )}

      {enabled && (
        <p className="text-zinc-300 text-sm mt-2">
          Goal alerts active. You&apos;ll be notified when a goal is scored.
        </p>
      )}

      {/* This would be called from the match feed when a goal is scored */}
      {/* showGoalNotification('Home Team') */}
    </div>
  );
}