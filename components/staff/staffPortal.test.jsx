// @vitest-environment happy-dom
/**
 * Unified staff portal: one sign-in, three desks, and a UI that only ever offers
 * the tools the signed-in role actually owns.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffPortal from './StaffPortal';
import { PERMISSION_LABELS, STAFF_ROLES, capabilityList } from '@/lib/admin/rbac';

vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

const CAPABILITIES = (role) => capabilityList(role).map((row) => ({ id: row.id, en: row.en, ar: row.ar }));

const USERS = [
  {
    id: 'viewer-abc123def456',
    handle: 'Fan One',
    banned: false,
    pageviews: 4,
    lastSeen: Date.now(),
    lastPath: '/',
    vipTier: 'free',
    balance: 1_200,
    unread: 0,
  },
];

/** A fetch double that answers every endpoint the portal touches. */
function stubFetch({ session, leads = [] }) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const target = String(url);
      calls.push({ url: target, method: init.method ?? 'GET' });
      if (target === '/api/admin/auth' && (init.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => session };
      }
      if (target === '/api/admin/auth' && init.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, role: 'moderator', capabilities: CAPABILITIES('moderator') }) };
      }
      if (target === '/api/admin/users') {
        return { ok: true, status: 200, json: async () => ({ users: USERS, tiers: [{ id: 'free' }, { id: 'gold' }] }) };
      }
      if (target === '/api/ads/enquiries') {
        return { ok: true, status: 200, json: async () => ({ leads, counts: { new: leads.length, contacted: 0, won: 0, lost: 0 } }) };
      }
      if (target === '/api/admin/auth' && init.method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ authenticated: false }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    })
  );
  return calls;
}

const signedOut = {
  authenticated: false,
  role: null,
  capabilities: [],
  desks: STAFF_ROLES.map((desk) => ({ id: desk.id, label: desk.label, labelAr: desk.labelAr, duty: desk.duty, accent: desk.accent })),
  provisioned: ['owner'],
};

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

const render = async (element) => {
  await act(async () => root.render(element));
};

/** Lets the mount effect's `setTimeout(load, 0)` run and its fetch resolve. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
};

describe('signed out', () => {
  it('shows the unified sign-in and the three desks, flagging the unprovisioned ones', async () => {
    stubFetch({ session: signedOut });
    await render(<StaffPortal hostRole="owner" staffHost host="staff.eviv.si" />);
    await flush();
    const portal = container.querySelector('[data-staff-portal]');
    expect(portal.textContent).toContain('Unified team portal');
    expect(container.querySelector('[data-staff-host]')).toBeTruthy();
    for (const desk of STAFF_ROLES) {
      const card = container.querySelector(`[data-staff-desk="${desk.id}"]`);
      expect(card, desk.id).toBeTruthy();
      expect(card.textContent).toContain(desk.label);
      expect(card.textContent).toContain(desk.labelAr);
    }
    expect(container.querySelector('[data-staff-desk="owner"]').textContent).toContain('Active');
    expect(container.querySelector('[data-staff-desk="support"]').textContent).toContain('Not provisioned');
    expect(container.querySelector('form input[name="username"]')).toBeTruthy();
    expect(container.querySelector('form input[type="password"]')).toBeTruthy();
  });
});

describe('signed in as a league moderator', () => {
  const session = {
    authenticated: true,
    role: 'moderator',
    roleLabel: 'League Moderator',
    capabilities: CAPABILITIES('moderator'),
    desks: [],
    provisioned: ['owner', 'moderator'],
  };

  it('renders the desk, its capabilities and only the tools it owns', async () => {
    stubFetch({
      session,
      leads: [
        {
          id: 'ad-1',
          reference: 'LL-ADS-7F3K',
          brand: 'Atlas Boots',
          contact: 'Nadia',
          email: 'nadia@atlasboots.ma',
          phone: '',
          packageId: 'pitch-side',
          budget: '3,000 MAD',
          message: 'Derby week banner.',
          partner: 'atlas-boots',
          status: 'new',
          at: Date.now(),
          acknowledged: false,
        },
      ],
    });
    await render(<StaffPortal hostRole="owner" />);
    await flush();
    await flush();

    expect(container.querySelector('[data-staff-role="moderator"]').textContent).toContain('League Moderator');
    expect(container.querySelector('[data-staff-capability="users.ban"]')).toBeTruthy();
    expect(container.querySelector('[data-staff-capability="ads.manage"]')).toBeTruthy();
    // Money surfaces are named as owner-only instead of being silently missing.
    expect(container.textContent).toContain(`Coin tools: owner only`);
    expect(container.textContent).toContain('VIP grants: owner only');

    // The moderation table is narrowed by the same capability list.
    const table = container.querySelector('[data-admin-users]');
    expect(table).toBeTruthy();
    expect(table.querySelector('[data-users-role="moderator"]')).toBeTruthy();
    expect(table.querySelector('[data-locked-permission="users.coins"]')).toBeTruthy();
    expect(table.querySelector('[data-locked-permission="users.vip"]')).toBeTruthy();
    expect(table.querySelector('[data-action="ban"]')).toBeTruthy();

    // The advertiser desk is a tab, and the queue shows the lead.
    const adsTab = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Advertisers'));
    expect(adsTab).toBeTruthy();
    await act(async () => {
      adsTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await flush();
    await flush();
    const lead = container.querySelector('[data-ad-lead="LL-ADS-7F3K"]');
    expect(lead).toBeTruthy();
    expect(lead.textContent).toContain('Atlas Boots');
    expect(lead.querySelector('[data-ad-lead-action="LL-ADS-7F3K:contacted"]')).toBeTruthy();
  });
});

describe('signed in as a support manager', () => {
  const session = {
    authenticated: true,
    role: 'support',
    capabilities: CAPABILITIES('support'),
    desks: [],
    provisioned: ['owner', 'support'],
  };

  it('offers notices but no bans, coins, VIP or advertiser tools', async () => {
    stubFetch({ session });
    await render(<StaffPortal hostRole="support" />);
    await flush();
    await flush();

    const table = container.querySelector('[data-admin-users]');
    expect(table.querySelector('[data-locked-permission="users.ban"]')).toBeTruthy();
    expect(table.querySelector('[data-locked-permission="users.coins"]')).toBeTruthy();
    expect(table.querySelector('[data-locked-permission="users.vip"]')).toBeTruthy();
    expect(table.querySelector('[data-action="ban"]')).toBeNull();

    // Every capability the API would refuse is rendered as a locked chip.
    for (const permission of ['users.ban', 'users.coins', 'users.vip']) {
      expect(table.textContent, permission).toContain('Locked');
      expect(PERMISSION_LABELS[permission].en.length).toBeGreaterThan(3);
    }

    // No advertiser tab (the API returns 403 for that role, so the UI never
    // pretends otherwise) and no coins/VIP controls anywhere in the portal.
    const labels = [...container.querySelectorAll('button')].map((button) => button.textContent);
    expect(labels.some((label) => label.includes('Advertisers'))).toBe(false);
    expect(table.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });
});
