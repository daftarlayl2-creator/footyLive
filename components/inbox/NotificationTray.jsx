'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { senderTheme } from '@/lib/inbox';
import { playSound } from '@/lib/sound/uiSound';
import useDeviceKind from '@/lib/hooks/useDeviceKind';
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
        className={`inbox-tray-row inbox-tray-row--${theme.id} flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.06] sm:py-2 2xl:py-2.5`}
        data-tray-message={message.id}
        data-sender={theme.id}
        data-read={String(Boolean(message.read))}
      >
        <span className="inbox-tray-dot mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: message.read ? 'transparent' : theme.accent, boxShadow: message.read ? 'none' : `0 0 8px ${theme.accent}` }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-black 2xl:text-[12.5px]" style={{ color: theme.accent }} dir="rtl">{theme.nameAr}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-60" suppressHydrationWarning>{stamp(message.at)}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-bold text-white 2xl:text-[13.5px]">{message.subject}</span>
        </span>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Shared tray body. Rendered twice by the shell — inside the anchored popover
 * on tablet/desktop and inside the portaled slide-up sheet on phones — so both
 * device layouts can never drift apart in content or behaviour.
 */
function TrayContent({ latest, unread, busy, onMarkAllRead, onOpen, onClose }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="text-[11px] font-black uppercase tracking-wider text-white 2xl:text-[13px]">
          Inbox <span className="font-bold normal-case tracking-normal opacity-60" dir="rtl">صندوق الرسائل</span>
        </p>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!unread || busy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-zinc-200 hover:border-eviv-lime/40 hover:text-eviv-lime disabled:opacity-40 2xl:px-2.5 2xl:py-1.5 2xl:text-[11.5px]"
        >
          <CheckCheck className="h-3 w-3" aria-hidden="true" />
          Read all
        </button>
      </div>
      {latest.length ? (
        <ul role="list" className="space-y-0.5">
          {latest.map((message) => (
            <TrayRow key={message.id} message={message} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-4 text-center text-[11.5px] font-semibold text-zinc-300 2xl:text-[13px]">
          No messages yet. Rewards receipts and platform notices will appear here the moment they are filed.
        </p>
      )}
      <Link
        href="/inbox"
        onClick={onClose}
        data-tray-open-inbox=""
        className="lime-cta tactile mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-black sm:py-2 2xl:py-2.5 2xl:text-[12.5px]"
      >
        Open full inbox
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}

/**
 * The notification tray in the app header: the unread counter plus the five
 * latest messages, without leaving the page you are on. Same store as /inbox —
 * the badge is a server count, never a client guess.
 *
 * Adaptive device layouts (CSS breakpoints decide, JS only adds behaviour):
 *  - Phones (<640px): a full-width slide-up sheet portaled to <body> — backdrop,
 *    drag handle, safe-area padding, scroll lock, z-index above the bottom nav
 *    and ad dock, so it can never overflow off-screen.
 *  - Tablet & desktop (≥640px): a compact popover anchored beneath the bell.
 *  - Smart TVs / very large screens (≥1536px + TV user agents): the same
 *    popover with scaled-up type and touch targets (data-device="tv").
 */
export default function NotificationTray() {
  const router = useRouter();
  const device = useDeviceKind();
  const { messages, unread, refresh, markRead, markAllRead, busy } = useInbox();
  const [open, setOpen] = useState(false);
  const shell = useRef(null);
  const sheetLayer = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event) => {
      const target = event.target;
      if (shell.current && shell.current.contains(target)) return;
      // The mobile sheet (and its backdrop) close themselves; taps inside the
      // sheet must never bubble into an outside-close.
      if (sheetLayer.current && sheetLayer.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  /* Phones only: freeze the page behind the sheet so it cannot scroll away. */
  useEffect(() => {
    if (!open || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    if (!window.matchMedia('(max-width: 639px)').matches) return undefined;
    const previous = document.body.getAttribute('style');
    document.body.style.overflow = 'hidden';
    return () => {
      if (previous == null) document.body.removeAttribute('style');
      else document.body.setAttribute('style', previous);
    };
  }, [open]);

  const close = () => setOpen(false);
  const latest = messages.filter((message) => !message.archived).slice(0, 5);
  const content = (
    <TrayContent
      latest={latest}
      unread={unread}
      busy={busy}
      onMarkAllRead={markAllRead}
      onClose={close}
      onOpen={(row) => {
        setOpen(false);
        if (!row.read) void markRead([row.id]);
        router.push('/inbox');
      }}
    />
  );

  return (
    <>
      <div className="relative" ref={shell} data-notification-tray="" data-device={device}>
        <button
          type="button"
          onClick={() => {
            playSound('tap');
            setOpen((current) => !current);
            if (!open) void refresh();
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={unread ? `Inbox · ${unread} unread message${unread === 1 ? '' : 's'}` : 'Inbox · nothing new'}
          className={`tactile relative flex h-9 w-9 items-center justify-center rounded-xl border transition 2xl:h-11 2xl:w-11 ${
            open ? 'border-eviv-lime/60 bg-eviv-lime/10 text-eviv-lime' : 'border-navy-750 bg-navy-900 text-lime-500 hover:border-lime-500/50 hover:bg-lime-500/10'
          }`}
          data-tray-toggle=""
        >
          <Bell className={`h-4 w-4 2xl:h-5 2xl:w-5 ${unread && !open ? 'inbox-bell-ring' : ''}`} aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-eviv-lime px-1 text-[9px] font-black text-[#18030A]" data-tray-badge="">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>

        {open ? (
          // Tablet & desktop (≥sm): compact popover, aligned under the bell.
          <div
            className="inbox-tray-panel glass-dark absolute right-0 top-full z-50 mt-2 hidden w-[min(360px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl p-2.5 shadow-2xl sm:block 2xl:w-[420px] 2xl:p-3.5"
            role="dialog"
            aria-label="Messages"
            data-tray-panel=""
            data-tray-layout="popover"
          >
            {content}
          </div>
        ) : null}
      </div>

      {open
        ? createPortal(
          // Phones (<sm): full-width slide-up sheet, portaled to <body> because
          // the sticky header's backdrop-filter would otherwise trap `fixed`.
          <div className="sm:hidden" ref={sheetLayer} data-tray-layer="sheet">
            <div
              className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[2px]"
              onClick={close}
              aria-hidden="true"
              data-tray-backdrop=""
            />
            <div
              className="inbox-tray-sheet glass-dark fixed inset-x-0 bottom-0 z-[90] max-h-[85dvh] overflow-hidden rounded-t-3xl shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Messages"
              data-tray-panel=""
              data-tray-sheet=""
              data-tray-layout="sheet"
            >
              <div className="flex justify-center pb-1 pt-2.5" aria-hidden="true">
                <span className="h-1 w-10 rounded-full bg-white/25" />
              </div>
              <div className="inbox-tray-sheet-body max-h-[calc(85dvh-2.75rem)] overflow-y-auto overscroll-contain px-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-1">
                {content}
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
}
