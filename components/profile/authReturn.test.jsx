// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_SESSION_KEY, configureAuth, getAuthSnapshot, resetAuthForTests } from '@/lib/auth/store';
import { AUTH_VERIFIER_COOKIE } from '@/lib/auth/return';
import AuthReturnNotice from './AuthReturnNotice';
import ProfileDashboard from './ProfileDashboard';
import AuthPanel from './AuthPanel';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));
const credentials = { url: 'https://test.supabase.co', anonKey: 'anon' };
const user = { id: 'fan-1', email: 'fan@example.com', email_confirmed_at: '2026-10-15', user_metadata: { display_name: 'Confirmed Fan' } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let container; let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.happyDOM.setURL('https://footy.example/profile');
  window.localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); resetAuthForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const render = async (element) => { await act(async () => root.render(element)); };
const click = async (element) => { await act(async () => element.click()); };
const button = (text) => [...container.querySelectorAll('button')].find((element) => element.textContent.includes(text));
function typeInto(input, value) {
  act(() => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
function setup(fetcher) {
  vi.stubGlobal('fetch', fetcher);
  configureAuth({ credentials, storage: window.localStorage, fetch: fetcher });
}

describe('auth return UI', () => {
  it('consumes the one-time handoff once even in StrictMode and persists the existing Supabase session', async () => {
    const fetcher = vi.fn(async (url) => String(url) === '/auth/session' ? json({ tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000 } }) : json(user));
    setup(fetcher);
    window.history.replaceState(null, '', '/profile?auth=complete');
    await render(<StrictMode><AuthReturnNotice authReturn="complete" /></StrictMode>);
    expect(fetcher.mock.calls.filter(([url]) => url === '/auth/session')).toHaveLength(1);
    expect(container.textContent).toContain('You’re signed in');
    expect(getAuthSnapshot()).toMatchObject({ status: 'authenticated', user: { displayName: 'Confirmed Fan', verified: true } });
    expect(JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY))).toMatchObject({ provider: 'supabase', accessToken: 'a' });
    expect(window.location.search).toBe('');
  });

  it('scrubs legacy implicit tokens before validation, including StrictMode effect replay', async () => {
    const fetcher = vi.fn(async () => {
      expect(window.location.hash).toBe('');
      return json(user);
    });
    setup(fetcher);
    window.history.replaceState(null, '', '/profile?auth=error&reason=missing#access_token=secret-access&refresh_token=secret-refresh&expires_in=3600');
    await render(<StrictMode><AuthReturnNotice authReturn="error" reason="missing" /></StrictMode>);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('You’re signed in');
    expect(window.location.href).not.toContain('secret');
    expect(getAuthSnapshot().status).toBe('authenticated');
  });

  it('shows an informative banner and the sign-in panel for expired callbacks, with a working resend action', async () => {
    const fetcher = vi.fn(async () => json({})); setup(fetcher);
    await render(<ProfileDashboard authReturn="error" authReason="expired" />);
    expect(container.querySelector('[role="alert"]').textContent).toContain('expired or was already used');
    expect([...container.querySelectorAll('[role="tab"]')].find((tab) => tab.getAttribute('aria-selected') === 'true').textContent).toContain('Sign in');
    typeInto(container.querySelector('input[type="email"]'), 'fan@example.com');
    await click(button('Resend confirmation email'));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/auth/v1/resend?redirect_to='), expect.objectContaining({ body: JSON.stringify({ type: 'signup', email: 'fan@example.com' }) }));
    expect(container.textContent).toContain('fresh link is on its way');
    expect(getAuthSnapshot().status).toBe('guest');
  });

  it('keeps the callback bridge mounted through dashboard hydration and shows the signed-in profile', async () => {
    setup(vi.fn(async (url) => url === '/auth/session' ? json({ tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000 } }) : json(user)));
    await render(<ProfileDashboard authReturn="complete" />);
    expect(container.querySelector('[data-profile-dashboard="authenticated"]')).not.toBeNull();
    expect(container.querySelector('#profile-heading').textContent).toBe('Confirmed Fan');
    expect(container.querySelector('[data-auth-panel]')).toBeNull();
  });

  it('recovers from missing handoffs, rejected tokens and transport errors with a banner rather than a blank page', async () => {
    const fetcher = vi.fn(async () => json({ error: 'gone' }, 401)); setup(fetcher);
    await render(<AuthReturnNotice authReturn="complete" />);
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/expired|missing/i);
    expect(getAuthSnapshot().status).toBe('guest');
    fetcher.mockRejectedValueOnce(new TypeError('offline'));
    await render(<AuthReturnNotice key="network" authReturn="complete" />);
    expect(container.textContent).toContain('temporarily unavailable');
  });

  it('passes the current public callback origin and browser PKCE challenge during sign-up', async () => {
    const fetcher = vi.fn(async () => json({ user })); setup(fetcher);
    await render(<AuthPanel provider="supabase" />);
    const inputs = container.querySelectorAll('[data-auth-panel] form input');
    typeInto(inputs[0], 'New Fan'); typeInto(inputs[1], 'fan@example.com'); typeInto(inputs[2], 'goal2026');
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    // WebCrypto's digest settles asynchronously.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('redirect_to=https%3A%2F%2Ffooty.example%2Fauth%2Fcallback'), expect.objectContaining({ body: expect.stringContaining('"code_challenge_method":"s256"') }));
    window.happyDOM.setURL('https://footy.example/auth/callback');
    expect(window.document.cookie).toMatch(new RegExp(`${AUTH_VERIFIER_COOKIE}=[A-Za-z0-9_-]{43}`));
    expect(container.textContent).toContain('Confirm your email');
  });
});
