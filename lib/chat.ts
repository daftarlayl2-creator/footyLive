/**
 * Pure helpers for the live match chat.
 */

export const MAX_MESSAGE_LENGTH = 280;
export const CHAT_HISTORY_LIMIT = 100;
export const NICKNAME_STORAGE_KEY = 'eviv:chat:name';
export const MAX_NICKNAME_LENGTH = 20;

export type DeliveryStatus = 'sending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string;
  match_id: string;
  username: string;
  avatar?: string;
  message: string;
  created_at: string;
  /** Client-only delivery state for optimistic messages. */
  _status?: DeliveryStatus;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  const m = value as ChatMessage | null;
  return Boolean(m && m.id && typeof m.message === 'string' && m.message.trim() && typeof m.created_at === 'string');
}

/** Collapses whitespace and trims to the maximum length. */
export function normalizeMessageText(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function sanitizeNickname(name: string): string {
  return String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH);
}

export function generateFanName(random: () => number = Math.random): string {
  return `Fan${1000 + Math.floor(random() * 9000)}`;
}

function byTime(a: ChatMessage, b: ChatMessage): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * Inserts or updates a message by id, keeping chronological order and the
 * newest `limit` messages. A confirmed copy (`sent`) never regresses to
 * `sending` when a late optimistic update arrives.
 */
export function upsertMessage(list: ChatMessage[], message: ChatMessage, limit = CHAT_HISTORY_LIMIT): ChatMessage[] {
  const index = list.findIndex((m) => m.id === message.id);
  let next: ChatMessage[];
  if (index >= 0) {
    const existing = list[index];
    const status =
      existing._status === 'sent' && message._status === 'sending' ? 'sent' : message._status ?? existing._status;
    next = [...list];
    next[index] = { ...existing, ...message, _status: status };
  } else {
    next = [...list, message].sort(byTime);
  }
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Merges a freshly loaded history with messages already on screen (e.g. still sending). */
export function mergeMessages(history: ChatMessage[], current: ChatMessage[], limit = CHAT_HISTORY_LIMIT): ChatMessage[] {
  let merged: ChatMessage[] = history.map((m) => ({ ...m, _status: m._status ?? ('sent' as DeliveryStatus) }));
  for (const message of current) merged = upsertMessage(merged, message, Number.POSITIVE_INFINITY);
  merged.sort(byTime);
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

export function initialsFor(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable hue (0–359) for a username, used for avatar colours. */
export function hueFor(name: string): number {
  let hash = 0;
  for (const char of String(name || '')) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 360;
}
