// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useInbox from './useInbox';

/**
 * Sprint: notification read-state persistence.
 *
 * The unread badge must never reappear on refresh. These tests pin the three
 * guarantees of the client ledger:
 *   1. every successful read/archive/remove is written to localStorage at once
 *      and broadcast on `limon:inbox-updated`;
 *   2. a server that comes back cold (cache wiped) and re-delivers an old
 *      message as "unread" cannot reopen the badge — the ledger re-pins it and
 *      quietly heals the server copy with a POST;
 *   3. the /inbox page and the header tray stay in sync through the event.
 */

const USER_ID = 'fan-inbox-client-1';
const LEDGER_KEY = `limon:inbox:ledger:v1:${USER_ID}`;
const WELCOME_ID = 'LL-WELC-001BM';

const welcomeUnread = (overrides = {}) => ({
  id: WELCOME_ID,
  from: 'support',
  kind: 'welcome',
  subject: 'Welcome to Limon Live — your inbox is open',
  subjectAr: 'مرحباً بك في ليمن لايف',
  body: 'Every reward you claim lands here as a signed receipt.',
  at: Date.parse('2026-10-16T10:00:00Z'),
  read: false,
  readAt: null,
  priority: 'normal',
  ...overrides,
});

let fetchMock;
const jsonResponse = (body) => ({ ok: true, json: async () => body });

/** Renders a probe component that records the hook's latest state on each render. */
const liveHarnesses = new Set();

async function renderHook() {
  const captured = { current: null };
  const calls = { markAllRead: 0, markRead: [] };

  function Probe() {
    const inbox = useInbox();
    captured.current = inbox;
    return (
      <>
        <button type="button" data-probe="mark-all" onClick={() => { calls.markAllRead += 1; void inbox.markAllRead(); }}>mark-all</button>
        <button type="button" data-probe="mark-one" onClick={() => { void inbox.markRead([WELCOME_ID]); }}>mark-one</button>
      </>
    );
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Probe />));
  const harness = {
    container,
    captured,
    calls,
    click: async (selector) => {
      await act(async () => container.querySelector(selector).click());
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
      liveHarnesses.delete(harness);
    },
  };
  liveHarnesses.add(harness);
  return harness;
}

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

afterEach(async () => {
  // Dismount anything a failed assertion left behind, so listeners never leak
  // from one test into the next.
  for (const harness of [...liveHarnesses]) await harness.unmount();
  vi.unstubAllGlobals();
});

describe('inbox read-state persistence (client ledger)', () => {
  it('persists read-all to localStorage immediately and broadcasts limon:inbox-updated', async () => {
    fetchMock = vi.fn(async (url, options) => {
      if (!options?.method || options.method === 'GET') {
        return jsonResponse({
          userId: USER_ID,
          messages: [welcomeUnread()],
          unread: 1,
          summary: { total: 1, unread: 1 },
        });
      }
      return jsonResponse({
        userId: USER_ID,
        messages: [welcomeUnread({ read: true, readAt: Date.now() })],
        unread: 0,
        summary: { total: 1, unread: 0 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    const onEvent = () => events.push('updated');
    window.addEventListener('limon:inbox-updated', onEvent);

    const harness = await renderHook();
    await flush();
    expect(harness.captured.current.unread).toBe(1);

    await harness.click('[data-probe="mark-all"]');
    await flush();

    expect(harness.captured.current.unread).toBe(0);
    // The ledger was written synchronously with the action, not on the next load.
    const ledger = JSON.parse(window.localStorage.getItem(LEDGER_KEY));
    expect(ledger.read[WELCOME_ID]).toBeGreaterThan(0);
    // Other inbox surfaces (header tray ↔ /inbox page) were told to pull now.
    expect(events).toEqual(['updated']);
    window.removeEventListener('limon:inbox-updated', onEvent);
    await harness.unmount();
  });

  it('a single markRead is persisted too (e.g. reading the welcome receipt)', async () => {
    fetchMock = vi.fn(async (url, options) => {
      if (!options?.method || options.method === 'GET') {
        return jsonResponse({ userId: USER_ID, messages: [welcomeUnread()], unread: 1, summary: { total: 1, unread: 1 } });
      }
      const body = JSON.parse(options.body);
      return jsonResponse({
        userId: USER_ID,
        messages: [welcomeUnread({ read: body.action === 'read', readAt: Date.now() })],
        unread: 0,
        summary: { total: 1, unread: 0 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const harness = await renderHook();
    await flush();
    await harness.click('[data-probe="mark-one"]');
    await flush();

    const ledger = JSON.parse(window.localStorage.getItem(LEDGER_KEY));
    expect(ledger.read[WELCOME_ID]).toBeGreaterThan(0);
    await harness.unmount();
  });

  it('the unread badge does not reappear on refresh when the server came back cold', async () => {
    // Previous session: the fan read the welcome note — the ledger remembers.
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify({ v: 1, read: { [WELCOME_ID]: 1760000000000 }, archived: {}, removed: {} }));

    // This session: the server cache was wiped and re-delivered the same
    // welcome note (stable id) as UNREAD — the old unread-loop bug.
    fetchMock = vi.fn(async (url, options) => {
      if (!options?.method || options.method === 'GET') {
        return jsonResponse({ userId: USER_ID, messages: [welcomeUnread()], unread: 1, summary: { total: 1, unread: 1 } });
      }
      return jsonResponse({ userId: USER_ID, messages: [welcomeUnread({ read: true })], unread: 0, summary: { total: 1, unread: 0 } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const harness = await renderHook();
    await flush();

    // The badge stays cleared and the row shows read…
    expect(harness.captured.current.unread).toBe(0);
    expect(harness.captured.current.messages[0].read).toBe(true);
    // …and the drift was healed back to the server so both sides agree.
    const heal = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(heal).toBeTruthy();
    expect(JSON.parse(heal[1].body)).toEqual({ action: 'read', ids: [WELCOME_ID] });
    await harness.unmount();
  });

  it('archived and dismissed messages stay gone after a refresh as well', async () => {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify({
      v: 1,
      read: { [WELCOME_ID]: 1760000000000 },
      archived: { 'rcpt-gone-1': 1760000001000 },
      removed: { 'rcpt-gone-2': 1760000002000 },
    }));
    fetchMock = vi.fn(async () => jsonResponse({
      userId: USER_ID,
      messages: [
        welcomeUnread(),
        welcomeUnread({ id: 'rcpt-gone-1', kind: 'receipt', subject: 'VIP pass receipt' }),
        welcomeUnread({ id: 'rcpt-gone-2', kind: 'receipt', subject: 'Coin adjustment' }),
      ],
      unread: 3,
      summary: { total: 3, unread: 3 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const harness = await renderHook();
    await flush();

    const byId = Object.fromEntries(harness.captured.current.messages.map((message) => [message.id, message]));
    // The dismissed row is gone entirely; the archived row stays pinned as
    // archived (so /inbox can still restore it) and the welcome stays read.
    expect(byId['rcpt-gone-2']).toBeUndefined();
    expect(byId['rcpt-gone-1'].archived).toBe(true);
    expect(byId[WELCOME_ID].read).toBe(true);
    expect(harness.captured.current.unread).toBe(0);
    await harness.unmount();
  });

  it('limon:inbox-updated from another surface (wallet redemption) pulls fresh mail', async () => {
    let welcomeRead = false;
    fetchMock = vi.fn(async () => {
      const message = welcomeUnread({ read: welcomeRead, readAt: welcomeRead ? Date.now() : null });
      return jsonResponse({
        userId: USER_ID,
        messages: [message],
        unread: welcomeRead ? 0 : 1,
        summary: { total: 1, unread: welcomeRead ? 0 : 1 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const harness = await renderHook();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The Rewards Store files a receipt and fires the shared event.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('limon:inbox-updated', { detail: { redeemed: 'vip-1' } }));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await harness.unmount();
  });
});
