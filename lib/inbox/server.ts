/**
 * Server-side Inbox store (`/inbox` + the header notification tray).
 *
 * One append-mostly record per fan, keyed by the same signed viewer identity the
 * wallet and the predictions use (so a receipt follows the fan, not the tab).
 * Reads fall back to an in-process copy exactly like the coin wallet, so a cache
 * outage never "loses" a message — and never invents one either.
 *
 * Delivery is deliberately one-directional: fans cannot write to another fan's
 * inbox. Only platform code (receipts, moderation, coin adjustments) and the
 * admin API (which is gated by the signed /mounadel session) can create rows.
 */
import { getCacheManager } from '@/lib/cache/cacheManager';
import logger from '@/lib/logger';
import {
  inboxMessageId,
  sanitizeInboxMessage,
  senderTheme,
  sortInbox,
  summarizeInbox,
  unreadCount,
  type InboxMessage,
  type InboxSenderId,
} from './index';

export const INBOX_KEY_PREFIX = 'limon:inbox:v1:';
const INBOX_TTL_S = 400 * 24 * 60 * 60;
/** Bounded per fan: a platform-wide broadcast must never grow a record forever. */
export const MAX_INBOX_MESSAGES = 120;

const VALID_USER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{4,79}$/;

export interface InboxStore {
  messages: InboxMessage[];
  updatedAt: number;
}

export interface DeliverInput {
  from?: InboxSenderId;
  kind?: InboxMessage['kind'];
  subject: string;
  subjectAr?: string;
  body: string;
  bodyAr?: string;
  priority?: InboxMessage['priority'];
  action?: { href: string; label: string };
  lines?: Array<{ label: string; value: string }>;
  replyWithinMinutes?: number;
  ticketRef?: string;
  reference?: string;
  pinned?: boolean;
  id?: string;
  at?: number;
}

const EMPTY: InboxStore = { messages: [], updatedAt: 0 };
const memory = new Map<string, InboxStore>();

export const isValidInboxUser = (value: unknown): value is string =>
  typeof value === 'string' && VALID_USER.test(value);

function sanitizeStore(raw: unknown): InboxStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const value = raw as { messages?: unknown; updatedAt?: unknown };
  const seen = new Set<string>();
  const messages = (Array.isArray(value.messages) ? value.messages : [])
    .flatMap((row) => {
      const message = sanitizeInboxMessage(row);
      if (!message || seen.has(message.id)) return [];
      seen.add(message.id);
      return [message];
    })
    .slice(-MAX_INBOX_MESSAGES);
  return {
    messages,
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
  };
}

function storeKey(userId: string): string {
  return INBOX_KEY_PREFIX + userId;
}

export async function loadInbox(userId: string): Promise<InboxStore> {
  if (!isValidInboxUser(userId)) return { ...EMPTY };
  try {
    const stored = await getCacheManager().get<unknown>(storeKey(userId));
    if (stored) {
      const store = sanitizeStore(stored);
      memory.set(userId, store);
      return store;
    }
  } catch (err) {
    logger.warn('Inbox read failed; using the in-process copy', { error: String(err) });
  }
  return memory.get(userId) ?? { ...EMPTY };
}

async function saveInbox(userId: string, store: InboxStore, now: number): Promise<InboxStore> {
  const next: InboxStore = {
    messages: sortInbox(store.messages.slice(-MAX_INBOX_MESSAGES)),
    updatedAt: now,
  };
  memory.set(userId, next);
  try {
    await getCacheManager().set(storeKey(userId), next, INBOX_TTL_S);
  } catch (err) {
    logger.warn('Inbox write failed; kept in process', { error: String(err) });
  }
  return next;
}

/**
 * Adds one message to a fan's inbox (idempotent on the id, newest first, capped).
 * Returns the stored row, or null when the recipient id is not usable.
 */
export async function deliverMessage(userId: string, input: DeliverInput, now = Date.now()): Promise<InboxMessage | null> {
  if (!isValidInboxUser(userId)) return null;
  const id = input.id ?? inboxMessageId(senderTheme(input.from).id.slice(0, 4), now, Math.floor(Math.random() * 1e6));
  const draft = sanitizeInboxMessage({ ...input, id, at: input.at ?? now, read: false, readAt: null });
  if (!draft) return null;

  const store = await loadInbox(userId);
  if (store.messages.some((message) => message.id === id)) return store.messages.find((message) => message.id === id)!;
  await saveInbox(userId, { ...store, messages: [draft, ...store.messages] }, now);
  return draft;
}

/** Delivers the same message to many fans (admin broadcast). Returns recipients. */
export async function deliverToMany(userIds: string[], input: DeliverInput, now = Date.now()): Promise<number> {
  const unique = [...new Set(userIds.filter(isValidInboxUser))];
  const results = await Promise.all(unique.map((userId) => deliverMessage(userId, { ...input, id: `${input.id ?? 'cast'}-${userId}` }, now)));
  return results.filter(Boolean).length;
}

export interface InboxView {
  messages: InboxMessage[];
  unread: number;
  summary: ReturnType<typeof summarizeInbox>;
}

export async function readInbox(userId: string, options: { includeArchived?: boolean; sender?: InboxSenderId | 'all' } = {}): Promise<InboxView> {
  const store = await loadInbox(userId);
  const visible = store.messages.filter((message) => {
    if (!options.includeArchived && message.archived) return false;
    if (options.sender && options.sender !== 'all' && senderTheme(message.from).id !== options.sender) return false;
    return true;
  });
  const messages = sortInbox(visible);
  return { messages, unread: unreadCount(messages), summary: summarizeInbox(store.messages) };
}

export async function markRead(userId: string, ids: string[], now = Date.now()): Promise<{ updated: number; unread: number }> {
  if (!isValidInboxUser(userId)) return { updated: 0, unread: 0 };
  const wanted = new Set(ids.filter((id) => typeof id === 'string' && id));
  const store = await loadInbox(userId);
  let updated = 0;
  const messages = store.messages.map((message) => {
    if (message.read || !wanted.has(message.id)) return message;
    updated += 1;
    return { ...message, read: true, readAt: now };
  });
  if (updated) await saveInbox(userId, { ...store, messages }, now);
  return { updated, unread: unreadCount(messages) };
}

export async function markAllRead(userId: string, now = Date.now()): Promise<{ updated: number; unread: number }> {
  if (!isValidInboxUser(userId)) return { updated: 0, unread: 0 };
  const store = await loadInbox(userId);
  let updated = 0;
  const messages = store.messages.map((message) => {
    if (message.read) return message;
    updated += 1;
    return { ...message, read: true, readAt: now };
  });
  if (updated) await saveInbox(userId, { ...store, messages }, now);
  return { updated, unread: 0 };
}

export async function archiveMessage(userId: string, id: string, archived = true, now = Date.now()): Promise<{ updated: boolean }> {
  if (!isValidInboxUser(userId)) return { updated: false };
  const store = await loadInbox(userId);
  let updated = false;
  const messages = store.messages.map((message) => {
    if (message.id !== id) return message;
    updated = true;
    return { ...message, archived };
  });
  if (updated) await saveInbox(userId, { ...store, messages }, now);
  return { updated };
}

export async function removeMessage(userId: string, id: string, now = Date.now()): Promise<{ removed: boolean }> {
  if (!isValidInboxUser(userId)) return { removed: false };
  const store = await loadInbox(userId);
  const messages = store.messages.filter((message) => message.id !== id);
  if (messages.length === store.messages.length) return { removed: false };
  await saveInbox(userId, { ...store, messages }, now);
  return { removed: true };
}

export async function unreadFor(userId: string): Promise<number> {
  const store = await loadInbox(userId);
  return unreadCount(store.messages.filter((message) => !message.archived));
}

/** Welcome note, delivered exactly once per fan (never spams the tray). */
export async function ensureWelcomeMessage(userId: string, now = Date.now()): Promise<boolean> {
  const store = await loadInbox(userId);
  if (store.messages.some((message) => message.kind === 'welcome')) return false;
  await deliverMessage(
    userId,
    {
      from: 'support',
      kind: 'welcome',
      subject: 'Welcome to Limon Live — your inbox is open',
      subjectAr: 'مرحباً بك في ليمن لايف · صندوقك جاهز',
      body: 'Every reward you claim, every coin movement and every moderation decision lands here as a signed receipt. Reply from this thread and a human from the support desk picks it up.',
      bodyAr: 'كل هدية تستلمها وكل حركة عملات وكل قرار إداري يصلك هنا كإيصال رسمي. رد على هذه الرسالة وسيتولى أحد زملائي في الدعم متابعتك.',
      replyWithinMinutes: 10,
      ticketRef: 'WELCOME',
      action: { href: '/profile#rewards', label: 'Open the Rewards Store' },
    },
    now
  );
  return true;
}

/** Test helper: clears the in-process inbox copy. */
export function resetInboxMemory(): void {
  memory.clear();
}

export { summarizeInbox, unreadCount };
