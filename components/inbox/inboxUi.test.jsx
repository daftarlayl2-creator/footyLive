// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SenderSeal from './SenderSeal';
import MessageCard from './MessageCard';
import NotificationTray from './NotificationTray';
import { SENDER_THEMES } from '@/lib/inbox';

vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };

const sampleMessage = (overrides = {}) => ({
  id: 'msg-test-1',
  from: 'platform',
  kind: 'receipt',
  subject: 'VIP Pass 1-month unlocked',
  subjectAr: 'تم تفعيل بطاقة VIP شهر كامل',
  body: 'Your coins were deducted and the entitlement is live.',
  at: Date.now() - 60_000,
  read: false,
  readAt: null,
  priority: 'normal',
  lines: [
    { label: 'Reward', value: 'VIP Pass 1 month' },
    { label: 'Coins spent', value: '−20,000' },
    { label: 'New balance', value: '5,000' },
  ],
  reference: 'LL-RCPT-TEST1',
  ...overrides,
});

describe('SenderSeal component', () => {
  it('renders official crest seal for Platform Management', () => {
    const html = renderToStaticMarkup(<SenderSeal sender="platform" size={40} />);
    expect(html).toContain('data-sender-seal="platform"');
    expect(html).toContain('inbox-seal--platform');
    expect(html).toContain('#F5C544'); // Gold
  });

  it('renders neon broadcast transmitter for The Admin', () => {
    const html = renderToStaticMarkup(<SenderSeal sender="admin" size={40} />);
    expect(html).toContain('data-sender-seal="admin"');
    expect(html).toContain('inbox-seal--admin');
    expect(html).toContain('#CCFF00'); // Neon lime
  });

  it('renders headset and communication waves for Support Team', () => {
    const html = renderToStaticMarkup(<SenderSeal sender="support" size={40} />);
    expect(html).toContain('data-sender-seal="support"');
    expect(html).toContain('inbox-seal--support');
    expect(html).toContain('#38BDF8'); // Sky blue
  });
});

describe('MessageCard component with distinctive sender badges', () => {
  it('styles Platform Management (إدارة الموقع) with gold/burgundy regalia, Arabic header and receipt lines', async () => {
    const msg = sampleMessage({ from: 'platform', kind: 'receipt' });
    await render(<MessageCard message={msg} expanded={true} />);

    expect(container.textContent).toContain(SENDER_THEMES.platform.nameAr);
    expect(container.textContent).toContain('Sealed by Limon Live');
    expect(container.textContent).toContain('VIP Pass 1-month unlocked');
    expect(container.textContent).toContain('−20,000');
    expect(container.textContent).toContain('LL-RCPT-TEST1');
    expect(container.querySelector('[data-sender="platform"]')).not.toBeNull();
  });

  it('styles The Admin (الأدمين) with neon-lime broadcast aesthetics and direct dispatch tags', async () => {
    const msg = sampleMessage({ from: 'admin', kind: 'announcement', subject: 'Emergency server boost' });
    await render(<MessageCard message={msg} expanded={true} />);

    expect(container.textContent).toContain(SENDER_THEMES.admin.nameAr);
    expect(container.textContent).toContain('Direct broadcast');
    expect(container.textContent).toContain('Broadcast');
    expect(container.querySelector('[data-sender="admin"]')).not.toBeNull();
  });

  it('styles Support Team (الدعم الفني) with professional ETA response indicator', async () => {
    const msg = sampleMessage({ from: 'support', kind: 'ticket', replyWithinMinutes: 10, subject: 'Ticket under review' });
    await render(<MessageCard message={msg} expanded={true} />);

    expect(container.textContent).toContain(SENDER_THEMES.support.nameAr);
    expect(container.textContent).toContain('First reply in');
    expect(container.querySelector('[data-sender="support"]')).not.toBeNull();
  });
});

describe('NotificationTray component in header', () => {
  it('renders bell and badge reflecting server unread counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        messages: [sampleMessage({ read: false }), sampleMessage({ id: 'msg-2', read: true })],
        unread: 1,
      }),
    })));

    await render(<NotificationTray />);
    const badge = container.querySelector('[data-tray-badge]');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('1');

    // Click toggle opens popup
    const button = container.querySelector('[data-tray-toggle]');
    await act(async () => button.click());

    expect(container.querySelector('[data-tray-panel]')).not.toBeNull();
    expect(container.textContent).toContain('VIP Pass 1-month unlocked');
  });
});
