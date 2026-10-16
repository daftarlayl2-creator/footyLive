import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/cache/cacheManager', () => ({
  getCacheManager: () => ({
    get: async (key: string) => (store.has(key) ? structuredClone(store.get(key)) : null),
    set: async (key: string, value: unknown) => { store.set(key, structuredClone(value)); },
  }),
}));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  SENDER_THEMES,
  senderTheme,
  relativeTimeLabel,
  referenceFor,
  summarizeInbox,
  unreadCount,
} from './index';
import {
  deliverMessage,
  ensureWelcomeMessage,
  loadInbox,
  markAllRead,
  markRead,
  readInbox,
  resetInboxMemory,
  archiveMessage,
  removeMessage,
} from './server';
import { GET as inboxGet, POST as inboxPost } from '@/app/api/inbox/route';
import { WALLET_COOKIE, createWalletViewer } from '@/lib/coins/session';

const USER = 'fan-inbox-test-12345';
const NOW = Date.parse('2026-10-16T14:00:00Z');

beforeEach(() => {
  store.clear();
  resetInboxMemory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

describe('Sender styling & hierarchies', () => {
  it('defines Platform Management (إدارة الموقع) with gold/burgundy regal aesthetics and crest seal', () => {
    const theme = SENDER_THEMES.platform;
    expect(theme.nameAr).toBe('إدارة الموقع');
    expect(theme.nameEn).toBe('Platform Management');
    expect(theme.seal).toBe('crest');
    expect(theme.accent).toBe('#F5C544'); // Gold
    expect(theme.cardClass).toContain('inbox-card--platform');
    expect(theme.chipClass).toContain('inbox-chip--platform');
    expect(theme.trustLabel).toContain('Sealed by Limon Live');
  });

  it('defines The Admin (الأدمين) with neon lime highlights and direct broadcast aesthetics', () => {
    const theme = SENDER_THEMES.admin;
    expect(theme.nameAr).toBe('الأدمين');
    expect(theme.nameEn).toBe('The Admin');
    expect(theme.seal).toBe('broadcast');
    expect(theme.accent).toBe('#CCFF00'); // Neon Lime
    expect(theme.cardClass).toContain('inbox-card--admin');
    expect(theme.metaLabel).toBe('Direct broadcast');
  });

  it('defines Support Team (الدعم الفني) with reassuring styling and fast-response indicator', () => {
    const theme = SENDER_THEMES.support;
    expect(theme.nameAr).toBe('الدعم الفني');
    expect(theme.nameEn).toBe('Support Team');
    expect(theme.seal).toBe('headset');
    expect(theme.accent).toBe('#38BDF8'); // Sky blue
    expect(theme.roleAr).toContain('يرد خلال دقائق');
    expect(theme.metaLabel).toBe('Support ticket');
  });

  it('falls back safely to platform theme for unrecognized senders', () => {
    expect(senderTheme('unknown-sender').id).toBe('platform');
    expect(senderTheme('admin').id).toBe('admin');
    expect(senderTheme('support').id).toBe('support');
  });
});

describe('Inbox delivery, state & unread calculations', () => {
  it('delivers messages from distinct senders and stores them newest-first', async () => {
    const msg1 = await deliverMessage(USER, {
      from: 'platform',
      kind: 'receipt',
      subject: 'Order confirmed',
      subjectAr: 'تم تأكيد الطلب',
      body: 'Your VIP pass is now active.',
      at: NOW - 5000,
    });
    const msg2 = await deliverMessage(USER, {
      from: 'admin',
      kind: 'announcement',
      subject: 'El Clásico live stream server 4 online',
      subjectAr: 'سيرفر الكلاسيكو 4 متاح الآن',
      body: 'High bitrate 4K stream is live.',
      priority: 'high',
      at: NOW,
    });

    expect(msg1).not.toBeNull();
    expect(msg2).not.toBeNull();

    const inbox = await readInbox(USER);
    expect(inbox.messages).toHaveLength(2);
    expect(inbox.unread).toBe(2);
    // Newest first
    expect(inbox.messages[0].from).toBe('admin');
    expect(inbox.messages[1].from).toBe('platform');

    const summary = summarizeInbox(inbox.messages);
    expect(summary.bySender.admin.unread).toBe(1);
    expect(summary.bySender.platform.unread).toBe(1);
  });

  it('marks individual messages or all messages as read', async () => {
    const msg = await deliverMessage(USER, {
      from: 'support',
      subject: 'Ticket answered',
      body: 'We refreshed your token.',
      at: NOW,
    });

    expect(await unreadCount((await readInbox(USER)).messages)).toBe(1);

    const markRes = await markRead(USER, [msg!.id], NOW + 1000);
    expect(markRes.updated).toBe(1);
    expect(markRes.unread).toBe(0);

    const updated = await readInbox(USER);
    expect(updated.messages[0].read).toBe(true);
    expect(updated.messages[0].readAt).toBe(NOW + 1000);
  });

  it('archives and restores messages from the visible list', async () => {
    const msg = await deliverMessage(USER, {
      from: 'platform',
      subject: 'Weekly summary',
      body: 'Here is your prediction score.',
      at: NOW,
    });

    // Archived messages are hidden from the default inbox view
    await archiveMessage(USER, msg!.id, true);
    const visible = await readInbox(USER);
    expect(visible.messages).toHaveLength(0);

    // But visible when includeArchived is passed
    const all = await readInbox(USER, { includeArchived: true });
    expect(all.messages).toHaveLength(1);
    expect(all.messages[0].archived).toBe(true);

    // Unarchive
    await archiveMessage(USER, msg!.id, false);
    const restored = await readInbox(USER);
    expect(restored.messages).toHaveLength(1);
  });

  it('creates automatic welcome note from Support on first fan visit', async () => {
    const first = await ensureWelcomeMessage(USER, NOW);
    expect(first).toBe(true);

    const inbox = await readInbox(USER);
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0].from).toBe('support');
    expect(inbox.messages[0].ticketRef).toBe('WELCOME');

    // Calling it again is idempotent and doesn't spam
    const second = await ensureWelcomeMessage(USER, NOW + 1000);
    expect(second).toBe(false);
    expect((await readInbox(USER)).messages).toHaveLength(1);
  });
});

describe('GET/POST /api/inbox route handler', () => {
  it('returns inbox with signed cookie, seeds welcome note and supports action: read-all', async () => {
    const { cookie } = createWalletViewer();
    const reqHeaders = { Cookie: `${WALLET_COOKIE}=${cookie}` };

    // GET
    const getRes = await inboxGet(new Request('https://limonlive.app/api/inbox', { headers: reqHeaders }));
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.unread).toBeGreaterThanOrEqual(1);

    // POST read-all
    const postRes = await inboxPost(new Request('https://limonlive.app/api/inbox', {
      method: 'POST',
      headers: { ...reqHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read-all' }),
    }));
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.unread).toBe(0);
  });

  it('allows fans to open a ticket to Support Team', async () => {
    const { cookie } = createWalletViewer();
    const reqHeaders = { Cookie: `${WALLET_COOKIE}=${cookie}` };

    const postRes = await inboxPost(new Request('https://limonlive.app/api/inbox', {
      method: 'POST',
      headers: { ...reqHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'support',
        subject: 'Redemption query',
        body: 'Where do I find my newly unlocked Diamond badge?',
      }),
    }));

    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.ticket).toBeDefined();
    expect(postBody.ticket.ref).toMatch(/^LL-TCK-/);
  });
});
