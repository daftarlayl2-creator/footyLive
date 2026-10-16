/**
 * Inbox message model + the three sender identities.
 *
 * Every message a fan receives — a Rewards Store receipt, a coin adjustment, a
 * moderation notice, a platform announcement — is one of these records. The
 * *who* decides the *how*: `SENDER_THEMES` carries the whole visual identity
 * (palette, seal, chip and card classes, Arabic + English name) so the inbox,
 * the notification tray and the admin composer can never disagree about what a
 * message from الأدمين looks like versus one from الدعم الفني.
 *
 * Pure module: no server imports, safe to bundle into a client component.
 */

export type InboxSenderId = 'platform' | 'admin' | 'support';

/**
 * Fired on `window` whenever the inbox changed server-side (a receipt was filed,
 * a message read). The header tray and the /inbox page both listen, so a
 * redemption updates its own receipt bubble without a page reload.
 */
export const INBOX_UPDATED_EVENT = 'limon:inbox-updated';

/** Tells every inbox listener on this tab that new mail should be pulled. */
export function notifyInboxUpdated(detail: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail }));
}

export const INBOX_SENDER_IDS: readonly InboxSenderId[] = ['platform', 'admin', 'support'];

export type InboxKind =
  | 'receipt'
  | 'reward'
  | 'vip'
  | 'coins'
  | 'moderation'
  | 'announcement'
  | 'welcome'
  | 'ticket';

export const INBOX_KINDS: readonly InboxKind[] = [
  'receipt',
  'reward',
  'vip',
  'coins',
  'moderation',
  'announcement',
  'welcome',
  'ticket',
];

export type InboxPriority = 'normal' | 'high' | 'urgent';

export interface InboxMessage {
  id: string;
  from: InboxSenderId;
  kind: InboxKind;
  /** Short line shown in the list (English). */
  subject: string;
  /** Short line shown in the list (Arabic, RTL). */
  subjectAr: string;
  body: string;
  bodyAr?: string;
  at: number;
  read: boolean;
  readAt: number | null;
  priority: InboxPriority;
  /** Optional call to action. */
  action?: { href: string; label: string };
  /** Receipt rows: price paid, new balance, valid until … */
  lines?: Array<{ label: string; value: string }>;
  /** Support SLA countdown (minutes to first reply). */
  replyWithinMinutes?: number;
  ticketRef?: string;
  /** Official seals carry a reference id (e.g. `LL-RCPT-8F2K`). */
  reference?: string;
  pinned?: boolean;
  archived?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Sender identities                                                         */
/* -------------------------------------------------------------------------- */

export interface SenderTheme {
  id: InboxSenderId;
  /** The name fans see, in Arabic — the platform's authoritative voice. */
  nameAr: string;
  nameEn: string;
  /** Handle shown under the name. */
  handle: string;
  /** Role line under the header. */
  roleAr: string;
  roleEn: string;
  /** Which seal art the component draws. */
  seal: 'crest' | 'broadcast' | 'headset';
  /** Core accent + soft tint (used by inline styles, so they are never purged). */
  accent: string;
  accentSoft: string;
  gradientFrom: string;
  gradientTo: string;
  /** Card chrome (Tailwind class strings). */
  cardClass: string;
  headerClass: string;
  chipClass: string;
  nameClass: string;
  sealClass: string;
  railClass: string;
  /** Status/verification wording under the sender name. */
  trustLabel: string;
  /** How the footer meta line is phrased. */
  metaLabel: string;
}

export const SENDER_THEMES: Record<InboxSenderId, SenderTheme> = {
  /** إدارة الموقع — regal, gold on burgundy, official platform seal. */
  platform: {
    id: 'platform',
    nameAr: 'إدارة الموقع',
    nameEn: 'Platform Management',
    handle: '@limon.management',
    roleAr: 'الجهة الرسمية المسؤولة عن المنصة',
    roleEn: 'Official platform authority',
    seal: 'crest',
    accent: '#F5C544',
    accentSoft: 'rgba(245,197,68,0.16)',
    gradientFrom: '#3D0B1D',
    gradientTo: '#18030A',
    cardClass: 'inbox-card inbox-card--platform',
    headerClass: 'inbox-header inbox-header--platform',
    chipClass: 'inbox-chip inbox-chip--platform',
    nameClass: 'inbox-sender-name--platform',
    sealClass: 'inbox-seal inbox-seal--platform',
    railClass: 'inbox-rail inbox-rail--platform',
    trustLabel: 'Sealed by Limon Live management',
    metaLabel: 'Official notice',
  },
  /** الأدمين — elite, neon lime, direct broadcast aesthetics. */
  admin: {
    id: 'admin',
    nameAr: 'الأدمين',
    nameEn: 'The Admin',
    handle: '@mounadel',
    roleAr: 'بث مباشر من غرفة التحكم',
    roleEn: 'Live from the command centre',
    seal: 'broadcast',
    accent: '#CCFF00',
    accentSoft: 'rgba(204,255,0,0.14)',
    gradientFrom: '#2A0813',
    gradientTo: '#0B1200',
    cardClass: 'inbox-card inbox-card--admin',
    headerClass: 'inbox-header inbox-header--admin',
    chipClass: 'inbox-chip inbox-chip--admin',
    nameClass: 'inbox-sender-name--admin',
    sealClass: 'inbox-seal inbox-seal--admin',
    railClass: 'inbox-rail inbox-rail--admin',
    trustLabel: 'Verified root operator',
    metaLabel: 'Direct broadcast',
  },
  /** الدعم الفني — clean, reassuring, fast-response indicator. */
  support: {
    id: 'support',
    nameAr: 'الدعم الفني',
    nameEn: 'Support Team',
    handle: '@limon.care',
    roleAr: 'متصل الآن · يرد خلال دقائق',
    roleEn: 'Online now · replies in minutes',
    seal: 'headset',
    accent: '#38BDF8',
    accentSoft: 'rgba(56,189,248,0.14)',
    gradientFrom: '#082F49',
    gradientTo: '#0B1220',
    cardClass: 'inbox-card inbox-card--support',
    headerClass: 'inbox-header inbox-header--support',
    chipClass: 'inbox-chip inbox-chip--support',
    nameClass: 'inbox-sender-name--support',
    sealClass: 'inbox-seal inbox-seal--support',
    railClass: 'inbox-rail inbox-rail--support',
    trustLabel: 'Certified support agent',
    metaLabel: 'Support ticket',
  },
};

export const DEFAULT_SENDER: InboxSenderId = 'platform';

export function isSenderId(value: unknown): value is InboxSenderId {
  return typeof value === 'string' && (INBOX_SENDER_IDS as readonly string[]).includes(value);
}

/** Theme for any value, falling back to the platform identity. */
export function senderTheme(value: unknown): SenderTheme {
  return SENDER_THEMES[isSenderId(value) ? value : DEFAULT_SENDER];
}

/* -------------------------------------------------------------------------- */
/*  Sanitizing (shared by the store and the API routes)                       */
/* -------------------------------------------------------------------------- */

export const MAX_SUBJECT_CHARS = 140;
export const MAX_BODY_CHARS = 1_200;
export const MAX_LINES = 6;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{4,79}$/;

const text = (value: unknown, max: number): string =>
  (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '').slice(0, max);

/** Same-origin, relative links only — a message must never link off-platform. */
function safeHref(value: unknown): string | null {
  const href = text(value, 200);
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

export function sanitizeInboxKind(value: unknown): InboxKind {
  return (INBOX_KINDS as readonly string[]).includes(String(value)) ? (value as InboxKind) : 'announcement';
}

export function sanitizeInboxMessage(raw: unknown): InboxMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' && SAFE_ID.test(value.id) ? value.id : '';
  const at = Number.isFinite(Number(value.at)) ? Math.trunc(Number(value.at)) : 0;
  if (!id || !at) return null;
  const subject = text(value.subject, MAX_SUBJECT_CHARS);
  const body = text(value.body, MAX_BODY_CHARS);
  if (!subject && !body) return null;
  const read = Boolean(value.read);
  const actionHref = safeHref((value.action as { href?: unknown } | undefined)?.href);
  const lines = Array.isArray(value.lines)
    ? (value.lines as Array<Record<string, unknown>>)
        .slice(0, MAX_LINES)
        .map((line) => ({ label: text(line?.label, 40), value: text(line?.value, 80) }))
        .filter((line) => line.label || line.value)
    : undefined;
  const priorityRaw = text(value.priority, 10);
  const replyWithin = Number.isFinite(Number(value.replyWithinMinutes)) ? Math.max(0, Math.min(1440, Math.trunc(Number(value.replyWithinMinutes)))) : undefined;

  return {
    id,
    from: senderTheme(value.from).id,
    kind: sanitizeInboxKind(value.kind),
    subject: subject || 'Platform notice',
    subjectAr: text(value.subjectAr, MAX_SUBJECT_CHARS),
    body,
    bodyAr: text(value.bodyAr, MAX_BODY_CHARS) || undefined,
    at,
    read,
    readAt: Number.isFinite(Number(value.readAt)) && Number(value.readAt) > 0 ? Math.trunc(Number(value.readAt)) : null,
    priority: priorityRaw === 'urgent' || priorityRaw === 'high' ? (priorityRaw as InboxPriority) : 'normal',
    ...(actionHref ? { action: { href: actionHref, label: text((value.action as { label?: unknown }).label, 40) || 'Open' } } : {}),
    ...(lines && lines.length ? { lines } : {}),
    ...(replyWithin ? { replyWithinMinutes: replyWithin } : {}),
    ...(text(value.ticketRef, 24) ? { ticketRef: text(value.ticketRef, 24) } : {}),
    ...(text(value.reference, 32) ? { reference: text(value.reference, 32) } : {}),
    ...(value.pinned ? { pinned: true } : {}),
    ...(value.archived ? { archived: true } : {}),
  };
}

/** Newest first, with pinned items kept on top of the unread block. */
export function sortInbox(messages: InboxMessage[]): InboxMessage[] {
  return [...messages].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.at - a.at;
  });
}

export function unreadCount(messages: InboxMessage[]): number {
  return messages.reduce((total, message) => total + (message.read || message.archived ? 0 : 1), 0);
}

export interface InboxSummary {
  total: number;
  unread: number;
  bySender: Record<InboxSenderId, { total: number; unread: number }>;
  lastAt: number | null;
}

export function summarizeInbox(messages: InboxMessage[]): InboxSummary {
  const bySender: Record<InboxSenderId, { total: number; unread: number }> = {
    platform: { total: 0, unread: 0 },
    admin: { total: 0, unread: 0 },
    support: { total: 0, unread: 0 },
  };
  let unread = 0;
  for (const message of messages) {
    if (message.archived) continue;
    const bucket = bySender[senderTheme(message.from).id];
    bucket.total += 1;
    if (!message.read) {
      bucket.unread += 1;
      unread += 1;
    }
  }
  const visible = messages.filter((message) => !message.archived);
  return {
    total: visible.length,
    unread,
    bySender,
    lastAt: visible.length ? Math.max(...visible.map((message) => message.at)) : null,
  };
}

/** `LL-RCPT-8F2K1` — the reference printed under official notices. */
export function referenceFor(prefix: string, seed: string | number): string {
  const base = typeof seed === 'number' ? seed : [...String(seed)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const tail = Math.abs(Math.trunc(base)).toString(36).toUpperCase().padStart(5, '0').slice(-5);
  return `LL-${prefix}-${tail}`;
}

export function inboxMessageId(prefix: string, now: number, salt = 0): string {
  return `${prefix}-${now.toString(36)}-${Math.abs(Math.trunc(salt)).toString(36) || '0'}`;
}

/** Human "2 minutes ago" style stamp for both languages (client + tests). */
export function relativeTimeLabel(at: number, now = Date.now(), locale: 'en' | 'ar' = 'en'): string {
  const diff = Math.max(0, now - at);
  const minutes = Math.floor(diff / 60_000);
  if (locale === 'ar') {
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  }
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
