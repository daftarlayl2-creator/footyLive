// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvivCoin, { CoinAmount } from './EvivCoin';
import WalletBadge from './WalletBadge';
import RewardsStore, { REWARDS } from './RewardsStore';
import WalletCard from './WalletCard';
import { VIP_PASS_COIN_COST } from '@/lib/coins';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/sound/uiSound', () => ({ playSound: vi.fn() }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  vi.clearAllMocks();
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

/** Wallet double with the same surface the Rewards Store consumes. */
const wallet = (overrides = {}) => ({
  balance: 0, awards: [], redemptions: [], vipActive: false, busy: false, error: null,
  redeem: vi.fn(async () => ({ ok: false, payload: { error: 'Not enough coins.' } })),
  ...overrides,
});

describe('animated 3D EVIV coin', () => {
  it('is a lime ring around a deep-burgundy core with an engraved E and a glowing aura', () => {
    const html = renderToStaticMarkup(<EvivCoin size={64} />);
    expect(html).toContain('data-eviv-coin=""');
    expect(html).toContain('aria-label="EVIV Coin"');
    // Lime ring (#CCFF00) + deep burgundy core (#2A0813) + engraved E path.
    expect(html).toContain('#CCFF00');
    expect(html).toContain('#2A0813');
    expect(html).toContain('M63 33 H39 V67 H63');
    expect(html).toContain('eviv-coin__aura');
    expect(html).toContain('eviv-coin--spin');
  });

  it('rotates in 3D and stops moving for reduced-motion users', async () => {
    const css = await import('node:fs').then((fs) => fs.readFileSync('app/globals.css', 'utf8'));
    expect(css).toContain('.eviv-coin--spin .eviv-coin__rotor');
    expect(css).toContain('perspective');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.eviv-coin--spin \.eviv-coin__rotor/);
    expect(css).toContain('@keyframes evivCoinSpin');
  });

  it('formats amounts safely and can render a static (non-spinning) coin', () => {
    const html = renderToStaticMarkup(<CoinAmount amount={12500} />);
    expect(html).toContain('12,500');
    expect(html).toContain('EVIV');
    expect(html).toContain('data-coin-amount="12500"');
    expect(renderToStaticMarkup(<CoinAmount amount={-5} />)).toContain('data-coin-amount="0"');
    expect(renderToStaticMarkup(<EvivCoin spin={false} />)).not.toContain('eviv-coin--spin');
  });
});

describe('wallet badge (header)', () => {
  it('shows the server balance and links to the Rewards Store', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ balance: 3_250, awards: [], redemptions: [] }) })));
    await render(<WalletBadge />);
    const link = container.querySelector('[data-wallet-badge]');
    expect(link.getAttribute('href')).toBe('/profile#rewards');
    expect(link.textContent).toContain('3,250');
    expect(link.querySelector('[data-eviv-coin]')).not.toBeNull();
  });

  it('paints a cached balance on the first frame but never lets a local edit stick', async () => {
    window.localStorage.setItem('eviv:coins', JSON.stringify({ balance: 999 }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ balance: 0, awards: [], redemptions: [] }) })));
    await render(<WalletBadge />);
    expect(container.querySelector('[data-wallet-badge]').textContent).toContain('0');
  });
});

describe('Rewards Store', () => {
  it('prices the 1-month VIP pass at 20,000 EVIV Coins', () => {
    const vip = REWARDS.find((reward) => reward.id === 'vip-1-month');
    expect(vip).toMatchObject({ cost: VIP_PASS_COIN_COST, days: 30 });
    expect(VIP_PASS_COIN_COST).toBe(20_000);
  });

  it('renders every reward with its price and blocks redemption below the price', async () => {
    await render(<RewardsStore wallet={wallet({ balance: 12_000 })} />);
    const store = container.querySelector('[data-rewards-store]');
    expect(store.textContent).toContain('Rewards Store');
    expect(store.textContent).toContain('20,000 coins = 1 month of VIP, free.');
    expect(store.querySelectorAll('[data-reward]')).toHaveLength(REWARDS.length);
    const vip = store.querySelector('[data-reward="vip-1-month"]');
    expect(vip.getAttribute('data-affordable')).toBe('false');
    expect(vip.querySelector('button').disabled).toBe(true);
    expect(vip.textContent).toContain('8,000 more coins needed');
  });

  it('redeems through the server when the balance is enough and reports the result', async () => {
    const redeem = vi.fn(async () => ({ ok: true, payload: { balance: 5_000 } }));
    await render(<RewardsStore wallet={wallet({ balance: 25_000, redeem })} />);
    const vip = container.querySelector('[data-reward="vip-1-month"]');
    expect(vip.getAttribute('data-affordable')).toBe('true');
    await act(async () => vip.querySelector('button').click());
    expect(redeem).toHaveBeenCalledWith('vip-1-month');
    expect(container.querySelector('[role="status"]').textContent).toContain('unlocked');
  });

  it('surfaces a server refusal instead of pretending the redemption worked', async () => {
    const redeem = vi.fn(async () => ({ ok: false, payload: { error: 'You need 20,000 EVIV Coins for this VIP pass.' } }));
    await render(<RewardsStore wallet={wallet({ balance: 30_000, redeem })} />);
    const vip = container.querySelector('[data-reward="vip-1-month"]');
    await act(async () => vip.querySelector('button').click());
    expect(container.querySelector('[role="status"]').textContent).toContain('20,000 EVIV Coins');
  });

  it('flags an active coin-bought VIP pass from the server payload', async () => {
    await render(<RewardsStore wallet={wallet({ balance: 100, vipActive: true })} />);
    expect(container.textContent).toContain('VIP active');
  });
});

describe('wallet card', () => {
  it('shows the balance, the earned total and the server-verified award ledger', async () => {
    await render(<WalletCard wallet={{
      balance: 1_500,
      awards: [{ matchId: 'espn-1', coins: 500, at: 1 }, { matchId: 'espn-2', coins: 1_000, at: 2 }],
    }} />);
    expect(container.textContent).toContain('1,500');
    expect(container.textContent).toContain('2 correct predictions paid');
    expect(container.textContent).toContain('1,500 coins earned');
    expect(container.textContent).toContain('Server verified');
    // The animated coin is part of the card.
    expect(container.querySelector('[data-eviv-coin]')).not.toBeNull();
  });

  it('invites the first reward when nothing has been earned yet', async () => {
    await render(<WalletCard wallet={{ balance: 0, awards: [] }} />);
    expect(container.textContent).toContain('Call a full-time result correctly to earn 500 coins.');
  });
});
