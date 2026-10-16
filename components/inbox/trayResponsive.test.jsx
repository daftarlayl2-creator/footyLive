// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationTray from './NotificationTray';
import { detectDeviceKind } from '@/lib/hooks/useDeviceKind';

vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      userId: 'fan-tray-test-1',
      messages: [{
        id: 'LL-WELC-001BM',
        from: 'support',
        kind: 'welcome',
        subject: 'Welcome to Limon Live — your inbox is open',
        subjectAr: 'مرحباً بك',
        body: 'Receipts land here.',
        at: Date.now() - 60_000,
        read: false,
        readAt: null,
        priority: 'normal',
      }],
      unread: 1,
      summary: { total: 1, unread: 1 },
    }),
  })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (element) => { await act(async () => root.render(element)); };

describe('Smart adaptive device detection', () => {
  it('classifies phones, tablets, desktops and smart TVs', () => {
    expect(detectDeviceKind(390, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobile');
    expect(detectDeviceKind(390)).toBe('mobile');
    expect(detectDeviceKind(640)).toBe('tablet');
    expect(detectDeviceKind(768, 'Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    expect(detectDeviceKind(1024)).toBe('desktop');
    expect(detectDeviceKind(1920)).toBe('desktop');
    // Smart TVs are detected by UA regardless of the emulated viewport size.
    expect(detectDeviceKind(1920, 'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0)')).toBe('tv');
    expect(detectDeviceKind(1280, 'Mozilla/5.0 (Web0S; Linux/SmartTV)')).toBe('tv');
    expect(detectDeviceKind(1280, 'Mozilla/5.0 (CrKey; a Chromecast)')).toBe('tv');
  });
});

describe('NotificationTray adaptive layouts', () => {
  it('renders both device layers from one markup: anchored popover (≥sm) and slide-up sheet (<sm)', async () => {
    await render(<NotificationTray />);
    const toggle = container.querySelector('[data-tray-toggle]');
    await act(async () => toggle.click());

    // Badge + popover stay inside the header shell (absolute, anchored to the bell).
    const popover = container.querySelector('[data-tray-panel][data-tray-layout="popover"]');
    expect(popover).not.toBeNull();
    expect(popover.className).toContain('absolute');
    expect(popover.className).toContain('sm:block');
    expect(popover.textContent).toContain('Welcome to Limon Live');
    expect(container.querySelector('[data-tray-badge]').textContent).toBe('1');

    // The mobile sheet is portaled to <body> (the sticky header's
    // backdrop-filter would otherwise trap `fixed` positioning) and carries the
    // slide-up chrome: backdrop, drag handle, safe-area padding, sheet layout.
    const layer = document.querySelector('[data-tray-layer="sheet"]');
    const sheet = document.querySelector('[data-tray-sheet]');
    expect(sheet).not.toBeNull();
    expect(container.contains(sheet)).toBe(false);
    expect(document.body.contains(sheet)).toBe(true);
    expect(layer.className).toContain('sm:hidden'); // phones only — desktop keeps the popover
    expect(sheet.className).toContain('fixed');
    expect(sheet.className).toContain('rounded-t-3xl');
    expect(sheet.getAttribute('data-tray-layout')).toBe('sheet');
    expect(sheet.querySelector('.inbox-tray-sheet-body')).not.toBeNull();
    expect(document.querySelector('[data-tray-backdrop]')).not.toBeNull();

    // Device kind is exposed for QA/telemetry on the tray root.
    expect(container.querySelector('[data-notification-tray]').getAttribute('data-device')).toBeTruthy();

    // Tapping the backdrop closes the whole tray; tapping inside the sheet must not.
    await act(async () => sheet.querySelector('[data-tray-message]').click());
    expect(document.querySelector('[data-tray-sheet]')).toBeNull();
  });

  it('backdrop tap dismisses the mobile sheet', async () => {
    await render(<NotificationTray />);
    await act(async () => container.querySelector('[data-tray-toggle]').click());
    expect(document.querySelector('[data-tray-sheet]')).not.toBeNull();
    await act(async () => document.querySelector('[data-tray-backdrop]').click());
    expect(document.querySelector('[data-tray-sheet]')).toBeNull();
    expect(container.querySelector('[data-tray-panel]')).toBeNull();
  });

  it('marks a row read from the tray and closes before navigating', async () => {
    await render(<NotificationTray />);
    await act(async () => container.querySelector('[data-tray-toggle]').click());
    const row = container.querySelector('[data-tray-message="LL-WELC-001BM"]');
    expect(row.getAttribute('data-read')).toBe('false');
    await act(async () => row.click());
    const post = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ action: 'read', ids: ['LL-WELC-001BM'] });
    // The ledger was synced at the same moment (badge survives refresh).
    const ledger = JSON.parse(window.localStorage.getItem('limon:inbox:ledger:v1:fan-tray-test-1'));
    expect(ledger.read['LL-WELC-001BM']).toBeGreaterThan(0);
    expect(document.querySelector('[data-tray-sheet]')).toBeNull();
  });
});
