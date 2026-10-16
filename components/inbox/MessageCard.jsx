'use client';

import { Archive, ArchiveRestore, BadgeCheck, Clock, ExternalLink, MailOpen, Radio, Ticket } from 'lucide-react';
import { referenceFor, senderTheme } from '@/lib/inbox';
import SenderSeal from './SenderSeal';

const stamp = (at) => (at ? new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** Fast-response indicator: how long the support desk has said it will take. */
function supportEta(message) {
  const minutes = Number(message.replyWithinMinutes) || 0;
  if (!minutes) return null;
  const elapsed = Math.max(0, Math.floor((Date.now() - message.at) / 60_000));
  const left = Math.max(0, minutes - elapsed);
  return { minutes, elapsed, left, overdue: left === 0 };
}

const KIND_CHIP = {
  receipt: 'Receipt',
  reward: 'Payout',
  vip: 'VIP access',
  coins: 'Coins',
  moderation: 'Moderation',
  announcement: 'Announcement',
  welcome: 'Welcome',
  ticket: 'Ticket',
};

/**
 * One message in the centre, styled entirely by who sent it:
 * the crest + gold/burgundy regalia of إدارة الموقع, the neon-lime broadcast
 * chrome of الأدمين, or the calm sky professional card of الدعم الفني.
 */
export default function MessageCard({ message, onRead, onArchive, expanded = false, onToggle }) {
  const theme = senderTheme(message.from);
  const eta = theme.id === 'support' ? supportEta(message) : null;
  const reference = message.reference || referenceFor(message.kind.slice(0, 4).toUpperCase(), message.id);

  return (
    <article
      className={`${theme.cardClass} relative overflow-hidden rounded-2xl border`}
      data-message={message.id}
      data-sender={theme.id}
      data-read={String(Boolean(message.read))}
      data-priority={message.priority}
    >
      <span className={theme.railClass} aria-hidden="true" />

      <header className={theme.headerClass}>
        <SenderSeal sender={theme.id} size={40} animated={!message.read} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`truncate text-sm font-black ${theme.nameClass}`} dir="rtl">
              {theme.nameAr}
            </h3>
            <span className={`${theme.chipClass} inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider`}>
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              {theme.trustLabel}
            </span>
            {message.pinned ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                Pinned
              </span>
            ) : null}
            {message.priority && message.priority !== 'normal' ? (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${message.priority === 'urgent' ? 'bg-red-500/20 text-red-200' : 'bg-amber-400/20 text-amber-100'}`}>
                {message.priority}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-bold uppercase tracking-wide opacity-80">
            <span dir="ltr">{theme.handle}</span>
            <span aria-hidden="true">·</span>
            <span>{theme.metaLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono normal-case tracking-normal">{reference}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <time className="text-[10px] font-bold opacity-75" dateTime={new Date(message.at).toISOString()}>
            <span suppressHydrationWarning>{stamp(message.at)}</span>
          </time>
          <div className="flex items-center gap-1">
            {!message.read ? (
              <button
                type="button"
                onClick={() => onRead?.(message.id)}
                className="inbox-icon-button"
                title="Mark as read"
                aria-label={`Mark the message from ${theme.nameEn} as read`}
              >
                <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onArchive?.(message.id, !message.archived)}
              className="inbox-icon-button"
              title={message.archived ? 'Move back to inbox' : 'Archive'}
              aria-label={message.archived ? 'Restore from archive' : 'Archive this message'}
            >
              {message.archived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => onToggle?.(message.id)}
          aria-expanded={expanded}
          className="w-full text-left"
          data-message-subject=""
        >
          <h4 className="text-[15px] font-extrabold leading-snug text-white">{message.subject}</h4>
          {message.subjectAr ? (
            <p className="mt-1 text-[13px] font-bold leading-relaxed text-zinc-200" dir="rtl" lang="ar">
              {message.subjectAr}
            </p>
          ) : null}
        </button>

        <div className={`inbox-message-body ${expanded ? 'is-expanded' : ''}`}>
          <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-zinc-300">{message.body}</p>
          {message.bodyAr ? (
            <p className="mt-2 text-[12.5px] font-semibold leading-loose text-zinc-300" dir="rtl" lang="ar">
              {message.bodyAr}
            </p>
          ) : null}

          {message.lines?.length ? (
            <dl className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {message.lines.map((line) => (
                <div key={`${line.label}-${line.value}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                  <dt className="text-[10px] font-black uppercase tracking-wider opacity-70">{line.label}</dt>
                  <dd className="text-[11.5px] font-black tabular-nums text-white">{line.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-200">
              <Ticket className="h-3 w-3" aria-hidden="true" />
              {KIND_CHIP[message.kind] ?? 'Notice'}
            </span>
            {eta ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black ${eta.overdue ? 'border-amber-300/40 bg-amber-300/10 text-amber-100' : 'border-sky-400/40 bg-sky-400/10 text-sky-100'}`}>
                <Clock className="h-3 w-3" aria-hidden="true" />
                {eta.overdue ? 'Answering now' : `First reply in ~${eta.left} min`}
              </span>
            ) : null}
            {theme.id === 'admin' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-eviv-lime/40 bg-eviv-lime/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-eviv-lime">
                <Radio className="h-3 w-3" aria-hidden="true" />
                Broadcast
              </span>
            ) : null}
            {message.action ? (
              <a
                href={message.action.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-eviv-lime px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#18030A] transition hover:brightness-110"
              >
                {message.action.label}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
