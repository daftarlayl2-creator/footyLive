'use client';

import { useEffect, useMemo, useState } from 'react';
import { HEALTH_REFRESH_MS, MAX_HEALTH_BATCH, freshHealth, isStreamHealth } from '@/lib/player/health';

/** Poll only signed media links, same-origin, while visible. Abort on source change/unmount. */
export default function useStreamHealth(servers, enabled = true) {
  const urls = useMemo(() => servers.filter((server) => server.url.startsWith('/api/proxy?')).map((server) => server.url).slice(0, 48), [servers]);
  const requestKey = JSON.stringify(urls);
  const [remote, setRemote] = useState({ requestKey: '', health: {} });

  useEffect(() => {
    const currentUrls = JSON.parse(requestKey);
    if (!enabled || !currentUrls.length) return undefined;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted || document.hidden) return;
      busy = true;
      try {
        const combined = {};
        for (let i = 0; i < currentUrls.length; i += MAX_HEALTH_BATCH) {
          const response = await fetch('/api/stream-health', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: currentUrls.slice(i, i + MAX_HEALTH_BATCH) }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          });
          if (!response.ok) continue; // never interpret a failed probe service as a dead stream
          const result = await response.json();
          for (const [key, health] of Object.entries(result.health || {})) {
            if (isStreamHealth(health)) combined[key] = health;
          }
        }
        if (!controller.signal.aborted) setRemote({ requestKey, health: combined });
      } catch {
        // Keep the last observation; stale observations age back to unknown.
        if (!controller.signal.aborted) setRemote((previous) => ({ ...previous }));
      } finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(refresh, HEALTH_REFRESH_MS);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [requestKey, enabled]);

  return useMemo(() => Object.fromEntries(servers.flatMap((server) => {
    const observed = remote.requestKey === requestKey ? remote.health[server.key] : undefined;
    const health = freshHealth(observed) ?? freshHealth(server.health);
    return health ? [[server.key, health]] : [];
  })), [servers, remote, requestKey]);
}
