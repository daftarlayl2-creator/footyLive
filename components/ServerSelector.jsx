'use client';

import { useEffect, useRef, useState } from 'react';
import { AppWindow, Check, ChevronDown, Server as ServerIcon, Zap } from 'lucide-react';
import { describeFailure } from '@/lib/player/servers';

/*
 * Server selection UI for <StreamPlayer>. Statuses come from the player's failover state:
 * 'playing' | 'connecting' | 'failed' | 'idle'.
 */

const STATUS_META = {
  playing: { dot: 'bg-lime-500', ping: true, text: 'Playing' },
  connecting: { dot: 'bg-amber-400', ping: true, text: 'Connecting' },
  failed: { dot: 'bg-red-500', ping: false, text: 'Failed' },
  idle: { dot: 'bg-zinc-400 dark:bg-zinc-600', ping: false, text: 'Standby' },
};

function StatusDot({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
      {meta.ping && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${meta.dot}`} />}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`} />
    </span>
  );
}

function QualityBadge({ quality }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
        quality === 'HD'
          ? 'border-lime-500/25 bg-lime-500/10 text-lime-600 dark:text-lime-400'
          : 'border-zinc-300 bg-zinc-200/70 text-zinc-500 dark:border-navy-750 dark:bg-navy-900 dark:text-zinc-500'
      }`}
    >
      {quality}
    </span>
  );
}

function serverTooltip(server, status, reason) {
  return [
    server.label,
    server.quality,
    server.kind === 'embed' ? 'Embedded player' : 'Native player (ad-free)',
    status === 'failed' ? `Failed: ${describeFailure(reason)}` : STATUS_META[status].text,
  ].join(' · ');
}

/** Segmented "Server 1 · Server 2 · Backup" selector shown under the player. */
export default function ServerSelector({ servers, activeKey, statusOf, failed, autoSwitch, onSelect, onToggleAutoSwitch }) {
  return (
    <div className="glass-panel rounded-xl p-3 shadow-md sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
          <ServerIcon className="h-3.5 w-3.5 text-lime-500" aria-hidden="true" />
          Servers
        </span>

        <div role="group" aria-label="Stream servers" className="flex flex-wrap items-center gap-2">
          {servers.map((server) => {
            const status = statusOf(server);
            const isActive = server.key === activeKey;
            const isFailed = status === 'failed';
            const tooltip = serverTooltip(server, status, failed[server.key]);
            return (
              <button
                key={server.key}
                type="button"
                onClick={() => onSelect(server)}
                aria-pressed={isActive}
                aria-label={tooltip}
                title={tooltip}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
                  isActive
                    ? isFailed
                      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'border-lime-500/45 bg-lime-600/10 text-lime-700 shadow-sm dark:text-lime-300 dark:shadow-[0_0_15px_rgba(198,255,0,0.12)]'
                    : isFailed
                      ? 'border-red-500/20 bg-red-500/[0.04] text-zinc-500 hover:border-red-500/40 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'
                      : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-400 dark:hover:bg-navy-900 dark:hover:text-zinc-200'
                }`}
              >
                <StatusDot status={status} />
                <span className={isFailed && !isActive ? 'line-through decoration-red-500/60' : undefined}>{server.label}</span>
                {server.kind === 'embed' ? (
                  <AppWindow className="h-3 w-3 opacity-60" aria-hidden="true" />
                ) : (
                  <Zap className="h-3 w-3 opacity-60" aria-hidden="true" />
                )}
                <QualityBadge quality={server.quality} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={autoSwitch}
          onClick={onToggleAutoSwitch}
          title="Automatically move to the next server when the current one fails"
          className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Auto-switch
          <span
            className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
              autoSwitch ? 'bg-lime-500' : 'bg-zinc-300 dark:bg-zinc-800'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${
                autoSwitch ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

/** Compact server switcher inside the player, reachable in fullscreen and theater mode. */
export function ServerMenu({ servers, activeKey, statusOf, failed, onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const activeServer = servers.find((s) => s.key === activeKey);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!activeServer) return null;

  return (
    <div ref={rootRef} className="absolute right-3 top-3 z-30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current server: ${activeServer.label}. Switch server`}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-navy-750/80 bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-md transition-colors hover:border-lime-500/50"
      >
        <StatusDot status={statusOf(activeServer)} />
        {activeServer.label}
        <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Servers"
          className="absolute right-0 mt-2 w-52 animate-fade-in rounded-xl border border-navy-750 bg-navy-950/95 p-1.5 shadow-2xl backdrop-blur-md"
        >
          {servers.map((server) => {
            const status = statusOf(server);
            const isActive = server.key === activeKey;
            return (
              <button
                key={server.key}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setOpen(false);
                  onSelect(server);
                }}
                title={serverTooltip(server, status, failed[server.key])}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                  isActive ? 'bg-lime-600/15 text-lime-300' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <StatusDot status={status} />
                <span className="flex-1">{server.label}</span>
                <span className={`text-[9px] font-extrabold uppercase ${status === 'failed' ? 'text-red-400' : 'text-zinc-500'}`}>
                  {status === 'failed' ? 'Failed' : server.quality}
                </span>
                <Check className={`h-3.5 w-3.5 text-lime-400 ${isActive ? '' : 'invisible'}`} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
