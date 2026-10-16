'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCheck, Inbox as InboxIcon, Loader2, RefreshCcw, Send, Sparkles } from 'lucide-react';
import { SENDER_THEMES } from '@/lib/inbox';
import { playSound } from '@/lib/sound/uiSound';
import useInbox from './useInbox';
import MessageCard from './MessageCard';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'platform', label: SENDER_THEMES.platform.nameAr },
  { id: 'admin', label: SENDER_THEMES.admin.nameAr },
  { id: 'support', label: SENDER_THEMES.support.nameAr },
  { id: 'archive', label: 'Archive' },
];

/** Legend that explains the three hierarchies before the fan reads anything. */
function SenderLegend() {
  return (
    <ul className="grid gap-2 sm:grid-cols-3" data-inbox-legend="">
      {Object.values(SENDER_THEMES).map((theme) => (
        <li key={theme.id} className={`inbox-legend inbox-legend--${theme.id} flex items-start gap-2.5 rounded-2xl border p-3`}>
          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg`} style={{ background: theme.accentSoft, color: theme.accent }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-black" dir="rtl">{theme.nameAr}</span>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider opacity-70">{theme.nameEn}</span>
            <span className="mt-1 block text-[11px] font-semibold leading-snug opacity-85" dir="rtl">{theme.roleAr}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * /inbox — the message centre. Receipts from the Rewards Store, coin
 * adjustments, VIP grants, moderation notices and operator broadcasts, each one
 * dressed in its sender's identity.
 */
export default function MessageCenter({ initial = null }) {
  const inbox = useInbox();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set(initial?.messages?.slice(0, 1).map((message) => message.id) ?? []));
  const [support, setSupport] = useState({ open: false, subject: '', body: '', status: '' });

  const messages = useMemo(() => {
    return inbox.messages.length ? inbox.messages : (initial?.messages ?? []);
  }, [inbox.messages, initial?.messages]);
  const unread = messages.filter((message) => !message.read).length;

  const visible = useMemo(() => {
    if (filter === 'archive') return messages.filter((message) => message.archived);
    const live = messages.filter((message) => !message.archived);
    if (filter === 'all') return live;
    return live.filter((message) => message.from === filter);
  }, [messages, filter]);

  const toggle = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markAll = async () => {
    playSound('tap');
    await inbox.markAllRead();
  };

  const sendSupport = async (event) => {
    event.preventDefault();
    playSound('tap');
    const result = await inbox.askSupport(support.subject || 'Help request from the inbox', support.body);
    if (result?.ok) {
      setSupport({ open: false, subject: '', body: '', status: '' });
      playSound('success');
    } else {
      setSupport((current) => ({ ...current, status: result?.payload?.error || 'Support could not take your message just now.' }));
      playSound('error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-5 sm:px-4" data-inbox="">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="tactile inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:border-eviv-lime/40 hover:text-eviv-lime" aria-label="Back to matches">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-white sm:text-2xl">
              <InboxIcon className="h-5 w-5 text-eviv-lime" aria-hidden="true" />
              Inbox
              <span className="text-base font-black opacity-70" dir="rtl">صندوق الرسائل</span>
            </h1>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">
              {unread ? `${unread} unread · receipts, payouts, VIP access and platform notices` : 'Every receipt, payout and platform notice in one place'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => inbox.refresh()} className="tactile inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-eviv-lime/40" disabled={inbox.busy}>
            {inbox.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            Refresh
          </button>
          <button type="button" onClick={markAll} className="lime-cta tactile inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black" disabled={!unread || inbox.busy} data-inbox-mark-all="">
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all read
          </button>
        </div>
      </div>

      <SenderLegend />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Inbox filters">
        {FILTERS.map((row) => {
          const count = row.id === 'all' ? messages.filter((message) => !message.archived).length : row.id === 'archive' ? messages.filter((message) => message.archived).length : messages.filter((message) => message.from === row.id && !message.archived).length;
          const active = filter === row.id;
          return (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(row.id)}
              data-inbox-filter={row.id}
              className={`tactile inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${
                active ? 'border-eviv-lime/50 bg-eviv-lime/15 text-eviv-lime' : 'border-white/10 text-zinc-300 hover:border-white/25 hover:text-white'
              }`}
            >
              <span dir="rtl">{row.label}</span>
              <span className="rounded-full bg-black/25 px-1.5 text-[10px] tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {inbox.error ? <p role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100">{inbox.error}</p> : null}

      <div className="flex flex-col gap-3" data-inbox-list="">
        {visible.length === 0 ? (
          <div className="glass-dark rounded-2xl p-8 text-center">
            <InboxIcon className="mx-auto h-7 w-7 text-eviv-lime/70" aria-hidden="true" />
            <p className="mt-2 text-sm font-black text-white">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] font-semibold text-zinc-300">
              Redeem anything in the Rewards Store and the receipt lands here instantly — so does every coin adjustment, VIP grant and platform notice.
            </p>
            <Link href="/profile#rewards" className="lime-cta tactile mt-3 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-black">
              Open the Rewards Store
            </Link>
          </div>
        ) : (
          visible.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              expanded={expanded.has(message.id)}
              onToggle={toggle}
              onRead={(id) => inbox.markRead([id])}
              onArchive={(id, archived) => inbox.archive(id, archived)}
            />
          ))
        )}
      </div>

      {/* Support desk: one field to open a ticket, styled as الدعم الفني. */}
      <section className="glass-dark rounded-2xl p-4" aria-labelledby="support-heading" data-support-desk="">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="support-heading" className="text-sm font-black text-white">
              Write to الدعم الفني
              <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-sky-200">avg first reply · 6 min</span>
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-300">A question about a redemption, a payout or a stream? It opens a ticket in this inbox.</p>
          </div>
          {!support.open ? (
            <button type="button" onClick={() => setSupport((current) => ({ ...current, open: true }))} className="tactile inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-400/40 px-3 py-1.5 text-[11px] font-black text-sky-100 hover:bg-sky-400/10">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              New ticket
            </button>
          ) : null}
        </div>
        {support.open ? (
          <form className="mt-3 space-y-2" onSubmit={sendSupport}>
            <input
              value={support.subject}
              onChange={(event) => setSupport((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Subject (e.g. My boost did not apply)"
              aria-label="Ticket subject"
              maxLength={140}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-white placeholder-zinc-500 focus:border-sky-400/50 focus:outline-none"
            />
            <textarea
              value={support.body}
              onChange={(event) => setSupport((current) => ({ ...current, body: event.target.value }))}
              placeholder="Tell us what happened — the more detail, the faster the fix."
              aria-label="Ticket message"
              rows={4}
              maxLength={900}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-white placeholder-zinc-500 focus:border-sky-400/50 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{support.status || 'Nothing is shared outside Limon Live.'}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSupport({ open: false, subject: '', body: '', status: '' })} className="tactile rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:text-white">
                  Cancel
                </button>
                <button type="submit" disabled={inbox.busy || support.body.trim().length < 10} className="lime-cta tactile inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black disabled:opacity-50">
                  {inbox.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                  Send
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
