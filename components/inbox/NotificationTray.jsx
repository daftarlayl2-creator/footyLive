'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { senderTheme } from '@/lib/inbox';
import { playSound } from '@/lib/sound/uiSound';
import useInbox from './useInbox';

const stamp = (at) => {
  if (!at) return '';
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/** Compact tray row: sender colour, who, subject, age. */
function TrayRow({ message, onOpen }) {
  const theme = senderTheme(message.from);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(message)}
        className={`inbox-tray-row inbox-tray-row--${theme.id} flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06]`}
        data-tray-message={message.id}
        data-sender={theme.id}
        data-read={String(Boolean(message.read))}
      >
        <span className="inbox-tray-dot mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: message.read ? 'transparent' : theme.accent, boxShadow: message.read ? 'none' : `0 0 8px ${theme.accent}` }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-black" style={{ color: theme.accent }} dir="rtl">{theme.nameAr}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">{stamp(message.at)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-bold text-white">{message.subject}</span>
        </span>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The notification tray in the app header: the unread counter plus the five
 * latest messages, without leaving the page you are on. Same store as /inbox —
 * the badge is a server count, never a client guess.
 */
export default function NotificationTray() {
  const router = useRouter();
  const { messages, unread, refresh, markRead, markAllRead, busy } = useInbox();
  const [open, setOpen] = useState(false);
  const shell = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event) => {
      if (shell.current && !shell.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const latest = messages.filter((message) => !message.archived).slice(0, 5);

  return (
    <div className="relative" ref={shell} data-notification-tray="">
      <button
        type="button"
        onClick={() => {
          playSound('tap');
          setOpen((current) => !current);
          if (!open) void refresh();
        }}
        aria-expanded={open}
        aria-label={unread ? `Inbox · ${unread} unread message${unread === 1 ? '' : 's'}` : 'Inbox · nothing new'}
        className={`tactile relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          open ? 'border-eviv-lime/60 bg-eviv-lime/10 text-eviv-lime' : 'border-navy-750 bg-navy-900 text-lime-500 hover:border-lime-500/50 hover:bg-lime-500/10'
        }`}
        data-tray-toggle=""
      >
        <Bell className={`h-4 w-4 ${unread && !open ? 'inbox-bell-ring' : ''}`} aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-eviv-lime px-1 text-[9px] font-black text-[#18030A]" data-tray-badge="">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="glass-dark absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl p-2.5 shadow-2xl"
          role="dialog"
          aria-label="Messages"
          data-tray-panel=""
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-white">
              Inbox <span className="font-bold normal-case tracking-normal opacity-60" dir="rtl">صندوق الرسائل</span>
            </p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unread || busy}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-200 hover:border-eviv-lime/40 hover:text-eviv-lime disabled:opacity-40"
            >
              <CheckCheck className="h-3 w-3" aria-hidden="true" />
              Read all
            </button>
          </div>
          {latest.length ? (
            <ul role="list" className="space-y-0.5">
              {latest.map((message) => (
                <TrayRow
                  key={message.id}
                  message={message}
                  onOpen={(row) => {
                    setOpen(false);
                    if (!row.read) void markRead([row.id]);
                    router.push('/inbox');
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="px-2 py-4 text-center text-[11.5px] font-semibold text-zinc-300">
              No messages yet. Rewards receipts and platform notices will appear here the moment they are filed.
            </p>
          )}
          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="lime-cta tactile mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black"
          >
            Open full inbox
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
