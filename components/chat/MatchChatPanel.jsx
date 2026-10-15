'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, BadgeCheck, Check, CheckCheck, MessageCircle, Pencil, RotateCw, SendHorizontal, X } from 'lucide-react';
import { createRowId, getLocalSupabase, useSupabase } from '@/lib/supabase';
import { readLocal, useLocalValue, writeLocal } from '@/lib/hooks/useLocalValue';
import {
  CHAT_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  MAX_NICKNAME_LENGTH,
  NICKNAME_STORAGE_KEY,
  generateFanName,
  hueFor,
  isChatMessage,
  isVerifiedMessage,
  legacyChatRecord,
  mergeMessages,
  normalizeMessageText,
  sanitizeNickname,
  upsertMessage,
} from '@/lib/chat';
import { useAuth } from '@/lib/auth';
import { CHAT_ACTIVITY_STORAGE_KEY, nextChatActivity, parseChatActivity } from '@/lib/fanStats';
import { playSound } from '@/lib/sound/uiSound';
import UserAvatar from '@/components/auth/UserAvatar';
import VerifiedBadge from '@/components/auth/VerifiedBadge';

const TABLE = 'match_messages';

const REACTIONS = [
  { emoji: '⚽', title: 'Celebrate goal' },
  { emoji: '🔥', title: 'Highlight moment' },
  { emoji: '😱', title: 'What a chance' },
  { emoji: '🟥', title: 'Red card' },
  { emoji: '👏', title: 'Great play' },
];

/** Horizontal launch point (%) for a floating reaction; only called from event handlers. */
function randomBurstOffset() {
  return 12 + Math.random() * 70;
}

function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Chat rows only carry small avatars: http(s) pictures or brand presets (never data: URLs). */
function shareableAvatar(avatarUrl) {
  return typeof avatarUrl === 'string' && (/^https:\/\//i.test(avatarUrl) || avatarUrl.startsWith('preset:')) ? avatarUrl : '/icon.svg';
}

/** Counts messages / reactions for the profile's Fan Stats (this device). */
function recordChatActivity(matchId, kind) {
  const next = nextChatActivity(parseChatActivity(readLocal(CHAT_ACTIVITY_STORAGE_KEY)), matchId, kind, Date.now());
  writeLocal(CHAT_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
}

/** False once the shared table rejected the user_id / verified columns (older schema). */
let extendedColumnsSupported = true;
const supportsExtendedColumns = () => extendedColumnsSupported;
const markLegacySchema = () => {
  extendedColumnsSupported = false;
};

const STATUS_PILL = {
  connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600 dark:text-amber-400' },
  live: { label: 'Live', dot: 'bg-lime-500 live-dot', text: 'text-lime-700 dark:text-lime-400' },
  device: { label: 'On this device', dot: 'bg-sky-400', text: 'text-sky-700 dark:text-sky-300' },
  offline: { label: 'Offline', dot: 'bg-zinc-400', text: 'text-zinc-500 dark:text-zinc-400' },
};

/**
 * Live match chat.
 *
 * The input is never disabled: messages appear instantly (optimistic) with a
 * delivery tick, failed sends offer a one-tap retry, Enter sends and focus
 * stays in the field so the mobile keyboard never collapses between
 * messages. History loads from `match_messages`, new messages stream in over
 * the realtime channel, and the list auto-scrolls unless the reader has
 * scrolled up (then a "new messages" pill appears).
 */
export default function MatchChatPanel({ matchId, userName }) {
  const id = String(matchId);
  const { supabase } = useSupabase();
  const [offline, setOffline] = useState(false);
  const client = offline ? getLocalSupabase() : supabase;

  const storedName = useLocalValue(NICKNAME_STORAGE_KEY);
  const auth = useAuth();
  const account = auth.status === 'authenticated' ? auth.user : null;
  const displayName = account?.displayName || storedName || userName || '';

  const [messages, setMessages] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [bursts, setBursts] = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const atBottomRef = useRef(true);
  const sentIdsRef = useRef(new Set());

  // History + realtime subscription.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('match_id', id)
        .order('created_at', { ascending: false })
        .limit(CHAT_HISTORY_LIMIT);
      if (cancelled) return;
      if (error) {
        if (client.mode === 'remote') {
          // Shared chat unreachable: keep the conversation going on this device.
          setOffline(true);
          return;
        }
        setConnection('offline');
        return;
      }
      const history = (data || []).filter(isChatMessage).reverse();
      setMessages((current) => mergeMessages(history, current));
      setConnection(client.mode === 'remote' ? 'live' : offline ? 'offline' : 'device');
    };

    load();

    const channel = client
      .channel(`match-chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE, filter: `match_id=eq.${id}` }, (payload) => {
        const message = payload.new;
        if (!isChatMessage(message)) return;
        setMessages((current) => upsertMessage(current, { ...message, _status: 'sent' }));
        if (!sentIdsRef.current.has(message.id) && !atBottomRef.current) setUnread((n) => n + 1);
      })
      .subscribe((status) => {
        if (cancelled || client.mode !== 'remote') return;
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR') setConnection('connecting');
      });

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [client, id, offline]);

  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => {
    const list = listRef.current;
    if (list && atBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    atBottomRef.current = atBottom;
    if (atBottom && unread) setUnread(0);
  };

  const jumpToLatest = () => {
    const list = listRef.current;
    atBottomRef.current = true;
    setUnread(0);
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  };

  const insert = async (row) => {
    try {
      const { error } = await client.from(TABLE).insert(row);
      return error;
    } catch (err) {
      return err;
    }
  };

  const deliver = async (record) => {
    const extended = record.user_id !== undefined || record.verified !== undefined;
    let error = await insert(extended && !supportsExtendedColumns() ? legacyChatRecord(record) : record);
    if (error && extended && supportsExtendedColumns() && client.mode === 'remote') {
      // Shared table without user_id / verified columns (or stricter policies): send the classic row.
      const retry = await insert(legacyChatRecord(record));
      if (!retry) markLegacySchema();
      error = retry;
    }
    setMessages((current) =>
      current.map((m) => (m.id === record.id && m._status !== 'sent' ? { ...m, _status: error ? 'failed' : 'sent' } : m))
    );
    if (error) playSound('error');
    else recordChatActivity(record.match_id, 'message');
  };

  const send = () => {
    const text = normalizeMessageText(input);
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    let name = displayName;
    if (!name) {
      name = generateFanName();
      writeLocal(NICKNAME_STORAGE_KEY, name);
    }
    const record = {
      id: createRowId(),
      match_id: id,
      username: name,
      avatar: account ? shareableAvatar(account.avatarUrl) : '/icon.svg',
      message: text,
      created_at: new Date().toISOString(),
      // Registered fans: account id + verified seal (guests keep the classic row shape).
      ...(account ? { user_id: account.id, verified: Boolean(account.verified) } : {}),
    };
    sentIdsRef.current.add(record.id);
    atBottomRef.current = true;
    setMessages((current) => upsertMessage(current, { ...record, _status: 'sending' }));
    setInput('');
    setUnread(0);
    playSound('send');
    // Keep focus (and the mobile keyboard) in the field for the next message.
    inputRef.current?.focus();
    deliver(record);
  };

  const retry = (message) => {
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, _status: 'sending' } : m)));
    deliver({
      id: message.id,
      match_id: message.match_id,
      username: message.username,
      avatar: message.avatar || '/icon.svg',
      message: message.message,
      created_at: message.created_at,
      ...(message.user_id ? { user_id: message.user_id, verified: Boolean(message.verified) } : {}),
    });
  };

  const react = (emoji) => {
    const burst = { id: createRowId(), emoji, left: randomBurstOffset() };
    setBursts((current) => [...current.slice(-11), burst]);
    playSound('pop');
    recordChatActivity(id, 'reaction');
  };

  const startEditingName = () => {
    setNameDraft(displayName);
    setEditingName(true);
  };

  const saveName = (event) => {
    event.preventDefault();
    const clean = sanitizeNickname(nameDraft);
    if (clean) writeLocal(NICKNAME_STORAGE_KEY, clean);
    setEditingName(false);
    playSound('success');
  };

  const pill = STATUS_PILL[connection] || STATUS_PILL.connecting;
  const remaining = MAX_MESSAGE_LENGTH - input.length;

  return (
    <section
      aria-label="Live Match Chat"
      data-sound="none"
      className="chat-panel app-card relative flex h-[460px] w-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-navy-200/70 px-4 py-3 dark:border-navy-750">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime-500/15 text-lime-600 dark:text-lime-400">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="truncate text-xs font-extrabold uppercase tracking-wider text-navy-900 dark:text-zinc-100">
            Live Match Chat
          </h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-[10px] font-bold dark:border-navy-750 dark:bg-navy-950 ${pill.text}`}
          title={connection === 'device' ? 'Messages are saved in this browser and sync across your open tabs' : undefined}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
          {pill.label}
        </span>
      </div>

      {/* Identity */}
      <div className="flex items-center justify-between gap-2 px-4 pt-2 text-[11px]">
        {account ? (
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-navy-600 dark:text-zinc-300">
              <UserAvatar name={account.displayName} avatarUrl={account.avatarUrl} size={20} />
              Chatting as
              <span className="truncate font-extrabold text-navy-900 dark:text-zinc-100">{account.displayName}</span>
              {account.verified && <VerifiedBadge size={14} />}
            </span>
            <Link href="/profile" className="tactile shrink-0 rounded-full px-1.5 py-0.5 font-bold text-lime-700 hover:underline dark:text-lime-300">
              Edit profile
            </Link>
          </div>
        ) : editingName ? (
          <form onSubmit={saveName} className="flex w-full items-center gap-1.5">
            <label htmlFor={`chat-name-${id}`} className="sr-only">
              Chat nickname
            </label>
            <input
              id={`chat-name-${id}`}
              autoFocus
              value={nameDraft}
              maxLength={MAX_NICKNAME_LENGTH}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your nickname"
              className="min-w-0 flex-1 rounded-lg border border-navy-200 bg-white px-2 py-1 text-base text-navy-900 outline-none focus:border-lime-500 sm:text-xs dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-100"
            />
            <button type="submit" data-sound="none" className="tactile rounded-lg bg-lime-500 p-1.5 text-navy-950" aria-label="Save nickname">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-sound="tap"
              onClick={() => setEditingName(false)}
              className="tactile rounded-lg border border-navy-200 p-1.5 text-navy-500 dark:border-navy-750 dark:text-zinc-400"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-sound="tap"
            onClick={startEditingName}
            className="tactile inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 font-semibold text-navy-500 hover:text-lime-700 dark:text-zinc-400 dark:hover:text-lime-400"
          >
            Chatting as <span className="font-extrabold text-navy-800 dark:text-zinc-200">{displayName || 'a new fan'}</span>
            <Pencil className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
        {!account && !editingName && (
          <Link
            href="/profile"
            className="tactile inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-bold text-sky-700 hover:underline dark:text-sky-300"
            title="Create a free account to get the verified badge"
          >
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Get verified
          </Link>
        )}
      </div>

      {/* Floating reactions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 h-0" aria-hidden="true">
        {bursts.map((burst) => (
          <span
            key={burst.id}
            className="animate-float-up absolute bottom-0 text-2xl drop-shadow-lg"
            style={{ left: `${burst.left}%` }}
            onAnimationEnd={() => setBursts((current) => current.filter((b) => b.id !== burst.id))}
          >
            {burst.emoji}
          </span>
        ))}
      </div>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        <ol
          ref={listRef}
          onScroll={handleScroll}
          aria-live="polite"
          aria-relevant="additions"
          className="h-full space-y-2 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {messages.map((message) => {
            const mine = account?.id && message.user_id ? message.user_id === account.id : Boolean(displayName) && message.username === displayName;
            const verified = isVerifiedMessage(message);
            return (
              <li key={message.id} className={`animate-slide-up flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
                {!mine && <UserAvatar name={message.username} avatarUrl={message.avatar} size={28} verified={verified} />}
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
                    mine
                      ? 'rounded-br-md bg-lime-500 text-navy-950'
                      : 'rounded-bl-md border border-navy-200/70 bg-navy-50 text-navy-900 dark:border-navy-750 dark:bg-navy-950/80 dark:text-zinc-100'
                  } ${message._status === 'failed' ? 'opacity-70 ring-1 ring-red-500/60' : ''}`}
                >
                  {!mine && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-extrabold" style={{ color: `hsl(${hueFor(message.username)} 70% 55%)` }}>
                      <span className="truncate">{message.username}</span>
                      {verified && <VerifiedBadge size={13} />}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.message}</p>
                  <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-navy-900/60' : 'text-navy-500 dark:text-zinc-400'}`}>
                    {formatTime(message.created_at)}
                    {mine && message._status === 'sending' && <Check className="h-3 w-3 opacity-60" aria-label="Sending" />}
                    {mine && message._status === 'sent' && <CheckCheck className="h-3 w-3" aria-label="Delivered" />}
                  </p>
                  {message._status === 'failed' && (
                    <button
                      type="button"
                      data-sound="tap"
                      onClick={() => retry(message)}
                      className="tactile mt-1 inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold text-white"
                    >
                      <RotateCw className="h-3 w-3" aria-hidden="true" /> Not sent · Retry
                    </button>
                  )}
                </div>
              </li>
            );
          })}

          {messages.length === 0 && (
            <li className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="text-3xl" aria-hidden="true">
                💬
              </span>
              <p className="text-xs font-semibold text-navy-500 dark:text-zinc-400">No messages yet. Be the first to chat!</p>
            </li>
          )}
        </ol>

        {unread > 0 && (
          <button
            type="button"
            data-sound="tap"
            onClick={jumpToLatest}
            className="tactile animate-pop-in absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-lime-500 px-3 py-1 text-[11px] font-extrabold text-navy-950 shadow-glow-lime"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {unread} new {unread === 1 ? 'message' : 'messages'}
          </button>
        )}
      </div>

      {/* Reactions */}
      <div className="flex items-center gap-1.5 border-t border-navy-200/70 px-3 pt-2 dark:border-navy-750">
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            title={reaction.title}
            aria-label={reaction.title}
            onClick={() => react(reaction.emoji)}
            className="tactile flex h-9 flex-1 cursor-pointer items-center justify-center rounded-xl border border-navy-200 bg-white text-base hover:border-lime-500/50 hover:bg-lime-500/10 dark:border-navy-750 dark:bg-navy-950/60"
          >
            {reaction.emoji}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex items-center gap-2 p-3"
      >
        <label htmlFor={`chat-input-${id}`} className="sr-only">
          Chat message
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id={`chat-input-${id}`}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Type a message…"
            maxLength={MAX_MESSAGE_LENGTH}
            autoComplete="off"
            enterKeyHint="send"
            aria-label="Chat message"
            className="w-full rounded-2xl border border-navy-200 bg-navy-50 py-2.5 pl-3.5 pr-12 text-base text-navy-900 placeholder-navy-400 outline-none transition-colors focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/25 sm:text-sm dark:border-navy-750 dark:bg-navy-950 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:bg-navy-950"
          />
          {input.length > MAX_MESSAGE_LENGTH - 60 && (
            <span
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums ${
                remaining <= 10 ? 'text-red-500' : 'text-navy-400 dark:text-zinc-400'
              }`}
            >
              {remaining}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send message"
          // Keep the input focused on touch devices (no blur → keyboard stays up).
          onPointerDown={(event) => event.preventDefault()}
          className="tactile flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-lime-500 text-navy-950 shadow-glow-lime hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <SendHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
