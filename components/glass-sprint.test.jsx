// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { SWRConfig } from 'swr';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAuth, resetAuthForTests, signUp } from '@/lib/auth/store';
import { EMBED_IFRAME_ALLOW } from '@/lib/player/embed';
import StreamPlayer from './StreamPlayer';
import LiveScoreboard from './LiveScoreboard';
import MatchCard from './MatchCard';
import VotingBar from './predictions/VotingBar';
import { MatchInsightsContent } from './predictions/MatchInsights';
import ClubHero from './club/ClubHero';
import VerifiedBadge from './auth/VerifiedBadge';
import UserAvatar, { avatarSealLayout } from './auth/UserAvatar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import CrestDrop from './clubs/CrestDrop';
import MatchChatPanel from './chat/MatchChatPanel';
import ProfileDashboard from './profile/ProfileDashboard';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/watch/espn-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('@/lib/sound/uiSound', async (original) => ({ ...(await original()), playSound: vi.fn() }));

/** Matches a solid white background utility (not translucent `bg-white/5`). */
const SOLID_WHITE = /bg-white(?![\w/-])/;

let container;
let root;

// Player frames load real documents, served locally (no network): provider pages are
// cross-origin (unreadable, like in a browser) and our redirect endpoint refuses links.
const iframeSettings = {};
beforeAll(() => {
  const settings = window.happyDOM.settings;
  Object.assign(iframeSettings, {
    enableIframePageLoading: settings.enableIframePageLoading,
    disableIframePageLoading: settings.disableIframePageLoading,
    interceptor: settings.fetch.interceptor,
  });
  settings.enableIframePageLoading = true;
  settings.disableIframePageLoading = false;
  settings.fetch.interceptor = {
    beforeAsyncRequest: async ({ request }) => {
      // Detection reads the frame location, not the status, so the refusal page is served as 200
      // here (the real route answers 403); that keeps happy-dom's network log quiet.
      const refused = new URL(request.url).pathname === '/api/stream-redirect';
      return new window.Response(refused ? '<p>Stream link has expired</p>' : '<p>Provider player</p>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    },
  };
});
afterAll(() => {
  const settings = window.happyDOM.settings;
  settings.enableIframePageLoading = iframeSettings.enableIframePageLoading;
  settings.disableIframePageLoading = iframeSettings.disableIframePageLoading;
  settings.fetch.interceptor = iframeSettings.interceptor;
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  refresh.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  resetAuthForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const render = async (element) => {
  await act(async () => root.render(<SWRConfig value={{ provider: () => new Map() }}>{element}</SWRConfig>));
};
const click = async (element) => {
  await act(async () => element.click());
};
const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(text));
const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
async function waitFor(assertion, attempts = 60) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await flush(25);
    }
  }
  throw lastError;
}
/** Types into a React-controlled input (native setter + input event). */
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const submit = async (form) => {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};
function inputByLabel(text, scope = container) {
  const label = [...scope.querySelectorAll('label')].find((l) => l.textContent.trim() === text);
  return label ? document.getElementById(label.getAttribute('for')) : null;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/* -------------------------------------------------------------------------- */
/*  1. Stream player: no sandbox, viewer reports, auto-retry, health probe     */
/* -------------------------------------------------------------------------- */

describe('StreamPlayer embeds', () => {
  const EMBEDS = [
    { name: 'Provider A', url: 'https://provider-a.example/embed/1', kind: 'embed' },
    { name: 'Provider B', url: 'https://provider-b.example/embed/2', kind: 'embed' },
  ];

  it('renders provider iframes without sandbox, with the permissive allow list', async () => {
    await render(<StreamPlayer channels={EMBEDS} matchTitle="AC Milan vs Inter" matchStatus="live" />);
    const frame = container.querySelector('iframe[data-player-frame]');
    expect(frame).not.toBeNull();
    expect(frame.hasAttribute('sandbox')).toBe(false);
    expect(frame.getAttribute('allow')).toBe(EMBED_IFRAME_ALLOW);
    expect(frame.hasAttribute('allowfullscreen')).toBe(true);
    expect(container.textContent).not.toMatch(/sandbox/i);
    // Player chrome is dark glass: no solid white buttons or cards.
    expect(container.querySelector('[data-player-toolbar]').outerHTML).not.toMatch(SOLID_WHITE);
    expect(container.querySelector('[data-server-selector]').className).toContain('glass-dark');
  });

  it('"Next server" leaves a provider player that shows its own error', async () => {
    await render(<StreamPlayer channels={EMBEDS} matchStatus="live" />);
    expect(container.querySelector('iframe').getAttribute('src')).toBe(EMBEDS[0].url);
    await click(buttonByText('Next server'));
    expect(container.querySelector('iframe').getAttribute('src')).toBe(EMBEDS[1].url);
    expect(container.textContent).toContain('Reported as not playing');
  });

  it('retries every server automatically once all of them failed', async () => {
    vi.useFakeTimers();
    await render(<StreamPlayer channels={EMBEDS} matchStatus="live" />);
    await click(buttonByText('Next server'));
    await click(buttonByText('Next server'));
    expect(container.textContent).toContain('All servers unavailable');
    expect(container.textContent).toContain('Retrying every server in 10s');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(container.textContent).toContain('Retrying every server in 7s');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('All servers unavailable');
    expect(container.querySelector('iframe').getAttribute('src')).toBe(EMBEDS[0].url);
  });

  it('lets the viewer cancel the automatic retry', async () => {
    vi.useFakeTimers();
    await render(<StreamPlayer channels={EMBEDS} matchStatus="live" />);
    await click(buttonByText('Next server'));
    await click(buttonByText('Next server'));
    await click(buttonByText('Cancel'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain('All servers unavailable');
    expect(container.textContent).not.toContain('Retrying every server');
  });

  it('detects a refused (expired) signed link inside the frame and fails over', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ health: 'unknown' })));
    const channels = [
      { url: '/api/stream-redirect?u=aHR0cHM6Ly9vbGQuZXhhbXBsZS9lbWJlZA&expires=1&sig=expired', kind: 'embed' },
      { url: 'https://provider-b.example/embed/2', kind: 'embed' },
    ];
    await render(<StreamPlayer channels={channels} matchStatus="live" />);
    await waitFor(() => expect(container.querySelector('iframe').getAttribute('src')).toBe('https://provider-b.example/embed/2'));
    expect(container.textContent).toContain('Provider player refused to load');
  });

  it('switches a restricted direct stream to the next embedded web player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ health: 'unknown' })));
    const channels = [
      { url: 'https://cdn.example/live/geo-blocked.mp4', kind: 'mp4' },
      { url: 'https://cdn.example/live/second.mp4', kind: 'mp4' },
      { url: 'https://provider-c.example/embed/3', kind: 'embed' },
    ];
    await render(<StreamPlayer channels={channels} matchStatus="live" />);
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    await act(async () => container.querySelector('video').dispatchEvent(new Event('error')));
    await waitFor(() => expect(container.querySelector('iframe[data-player-frame]')?.getAttribute('src')).toBe('https://provider-c.example/embed/3'));
    expect(container.textContent).toContain('Switched to Backup');
  });

  it('probes signed provider links server-side and prefers the direct backup on failure', async () => {
    const fetchMock = vi.fn(async () => json({ health: 'offline', status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const channels = [
      { url: '/api/stream-redirect?u=aHR0cHM6Ly9kZWFkLmV4YW1wbGUvZW1iZWQ&expires=9999999999999&sig=abc', kind: 'embed' },
      { url: 'https://provider-c.example/embed/3', kind: 'embed' },
      { url: 'https://cdn.example/live/backup.mp4', kind: 'mp4' },
    ];
    await render(<StreamPlayer channels={channels} matchStatus="live" />);
    // The direct MP4 backup wins over the next embed after an embedded player fails.
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('&check=1'), expect.anything());
    // DVR pill now lives inside the video stage instead of floating over the page header.
    const pill = container.querySelector('[data-dvr-pill]');
    expect(pill.className).toContain('absolute');
    expect(pill.className).not.toContain('fixed');
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Scoreboard: separated teams, anchored grouped scorers, centre badge     */
/* -------------------------------------------------------------------------- */

describe('LiveScoreboard redesign', () => {
  const initial = {
    status: 'live',
    homeScore: 2,
    awayScore: 1,
    currentMinute: "67'",
    currentMinuteNumber: 67,
    homeName: 'AC Milan',
    awayName: 'Inter',
    homeId: '103',
    awayId: '110',
    homeBadge: 'https://a.espncdn.com/i/teamlogos/soccer/500/103.png',
    awayBadge: 'https://a.espncdn.com/i/teamlogos/soccer/500/110.png',
    tournament: 'Serie A',
    period: 'Second Half',
    cards: { home: { yellow: 1, red: 0 }, away: { yellow: 0, red: 1 } },
    goals: [
      { side: 'home', player: 'Alphadjo Cissè', minute: "15'", penalty: false, ownGoal: false },
      { side: 'away', player: 'Lautaro Martínez', minute: "58'", penalty: true, ownGoal: false },
      { side: 'home', player: 'Alphadjo Cissè', minute: "32'", penalty: false, ownGoal: false },
    ],
    scorers: { home: ["Alphadjo Cissè 15'", "Alphadjo Cissè 32'"], away: ["Lautaro Martínez 58'"] },
  };

  it('anchors grouped scorers under their own team in separate columns', async () => {
    await render(<LiveScoreboard matchId="espn-1" initial={initial} />);
    const home = container.querySelector('[data-scorers="home"]');
    const away = container.querySelector('[data-scorers="away"]');
    expect(home.textContent).toContain('Alphadjo Cissè');
    expect(home.textContent).toContain("15', 32'");
    expect(home.querySelectorAll('li')).toHaveLength(1);
    expect(home.textContent).not.toContain('Martínez');
    expect(away.textContent).toContain('Lautaro Martínez');
    expect(away.textContent).toContain("58' (P)");
    expect(away.textContent).not.toContain('Cissè');

    // Home column: identity, score and scorers share column 1; away uses column 3.
    for (const selector of ['[data-team="home"]', '[data-score="home"]', '[data-scorers="home"]']) {
      expect(container.querySelector(selector).className).toContain('col-start-1');
    }
    for (const selector of ['[data-team="away"]', '[data-score="away"]', '[data-scorers="away"]']) {
      expect(container.querySelector(selector).className).toContain('col-start-3');
    }
    expect(container.querySelector('[data-team="home"]').textContent).toContain('AC Milan');
    expect(container.querySelector('[data-team="home"]').textContent).toContain('Home');
    expect(container.querySelector('[data-team="away"]').textContent).toContain('Away');
    expect(container.querySelector('[data-score="home"]').textContent).toContain('2');
    expect(container.querySelector('[data-score="away"]').textContent).toContain('1');
    expect(container.innerHTML).not.toContain('md:flex-row');

    const center = container.querySelector('[data-scoreboard-center]');
    expect(center.className).toContain('col-start-2');
    expect(center.textContent).toContain("67'");
    expect(center.querySelector('[data-period]').textContent).toBe('2nd half');
    expect(center.querySelector('[data-competition]').textContent).toContain('Serie A');

    expect(container.querySelectorAll('[data-crest-drop]')).toHaveLength(2);
    expect(container.querySelector('section').getAttribute('aria-label')).toBe("Scoreboard: AC Milan 2, Inter 1 · 67'");
  });

  it('shows full time with the result period', async () => {
    await render(<LiveScoreboard matchId="espn-2" initial={{ ...initial, status: 'finished', currentMinute: 'FT', period: 'Full Time' }} />);
    const center = container.querySelector('[data-scoreboard-center]');
    expect(center.textContent).toContain('FT');
    expect(center.querySelector('[data-period]').textContent).toBe('Full time');
  });
});

describe('MatchCard scorers & crests', () => {
  const LIVE = {
    id: 'espn-700001',
    title: 'Arsenal vs Liverpool',
    status: 'live',
    source: 'espn',
    timestamp: Date.now() - 30 * 60 * 1000,
    tournament: 'Premier League',
    homeTeam: { id: '359', name: 'Arsenal', badge: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png' },
    awayTeam: { id: '364', name: 'Liverpool', badge: '' },
    sources: [{ url: 'https://cdn.example.com/a.m3u8' }],
    homeScore: 2,
    awayScore: 1,
    currentMinute: "62'",
    live: {
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 1, red: 0 } },
      scorers: { home: ["Bukayo Saka 20'", "Bukayo Saka 55'"], away: ["Mohamed Salah 45'+0'"] },
      events: [],
    },
  };

  it('lists grouped scorers directly under their own team row inside liquid-glass crests', () => {
    const html = renderToStaticMarkup(<MatchCard match={LIVE} tab="live" />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('[data-team="home"] [data-scorers="home"]').textContent).toContain("Bukayo Saka 20', 55'");
    expect(doc.querySelector('[data-team="away"] [data-scorers="away"]').textContent).toContain("Mohamed Salah 45'+0'");
    expect(doc.querySelector('[data-team="home"]').textContent).not.toContain('Salah');
    expect(doc.querySelectorAll('[data-crest-drop]')).toHaveLength(2);
    expect(html).not.toContain('ui-avatars.com');
  });
});

/* -------------------------------------------------------------------------- */
/*  3 + 4. Dark glass predictor, liquid-glass crests                           */
/* -------------------------------------------------------------------------- */

describe('dark glass predictor', () => {
  it('settles the vote at full time, locks voting and records the result for fan stats', async () => {
    window.localStorage.setItem('eviv:vote:espn-9', JSON.stringify({ id: 'v1', prediction: 'home', at: 1 }));
    await render(
      <VotingBar matchId="espn-9" homeTeam={{ name: 'AC Milan' }} awayTeam={{ name: 'Inter' }} status="finished" homeScore={2} awayScore={1} />
    );
    const section = container.querySelector('section[aria-label="Match prediction"]');
    expect(section.className).toContain('glass-dark');
    expect(section.outerHTML).not.toMatch(SOLID_WHITE);
    expect(container.querySelector('[data-vote-outcome="correct"]').textContent).toContain('You called it');
    expect(container.querySelectorAll('button[aria-disabled="true"]')).toHaveLength(3);
    expect(container.textContent).toContain('Voting closed at full time');
    expect(JSON.parse(window.localStorage.getItem('eviv:fan:results'))['espn-9']).toMatchObject({ status: 'finished', homeScore: 2, awayScore: 1 });
    expect(container.querySelectorAll('[data-crest-drop]').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the insights panel free of light cards', () => {
    const html = renderToStaticMarkup(
      <MatchInsightsContent
        data={{ probabilities: { home: 50, draw: 25, away: 25 }, insights: ['Milan unbeaten in 5', 'Inter scored in 9 straight'], coverage: { form: true, standings: true, h2h: false } }}
        homeTeam={{ name: 'AC Milan' }}
        awayTeam={{ name: 'Inter' }}
      />
    );
    expect(html).not.toMatch(SOLID_WHITE);
    expect(html).not.toContain('text-navy-500');
    expect(html).toContain('glass-dark-tile');
  });
});

describe('liquid-glass crests', () => {
  it('wraps crests in a tinted glass drop with an initials fallback', () => {
    const html = renderToStaticMarkup(<CrestDrop src="" name="Raja CA" size={60} tint="#00843D" />);
    expect(html).toContain('class="crest-drop"');
    expect(html).toContain('--drop-size:60px');
    expect(html).toContain('--drop-tint:0 132 61');
    expect(html).toContain('crest-drop__initials');
    expect(html).toContain('>RC<');
    expect(renderToStaticMarkup(<CrestDrop src="https://a.espncdn.com/x.png" name="X" size="lg" tone="dark" />)).toContain('crest-drop crest-drop--lg crest-drop--dark');
  });

  it('replaces the white crest box on club pages', () => {
    const club = {
      espnId: '359',
      name: 'Arsenal',
      logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png',
      color: 'e20520',
      alternateColor: '003399',
      league: { slug: 'eng.1', name: 'English Premier League' },
    };
    const html = renderToStaticMarkup(<ClubHero club={club} form={['W']} />);
    expect(html).toContain('crest-drop crest-drop--xl crest-drop--dark');
    expect(html).toContain('--drop-tint:226 5 32');
    expect(html).not.toContain('bg-white/95');
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Auth, verified badge, profile and chat                                  */
/* -------------------------------------------------------------------------- */

describe('verified badge', () => {
  it('is an accessible brand seal in Limon lime and deep burgundy', () => {
    const html = renderToStaticMarkup(<VerifiedBadge size={20} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Verified fan"');
    expect(html).toContain('<title>Verified fan</title>');
    expect(html).toContain('#CCFF00');
    expect(html).toContain('#2A0813');
    // The old blue rosette is gone.
    expect(html).not.toMatch(/#1D9BF0|#6FD3FF|#1A4FD6/i);
  });

  it('renders in a fixed 1:1 box so it never stretches next to a username', async () => {
    await render(<p className="flex items-center gap-1"><span className="min-w-0 truncate">A very long fan display name</span><VerifiedBadge size={13} /></p>);
    const badge = container.querySelector('[data-verified-badge]');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('verified-badge');
    expect(badge.style.getPropertyValue('--vb-size')).toBe('13px');
    const seal = badge.querySelector('svg');
    expect(seal.getAttribute('aria-hidden')).toBe('true');
    expect([seal.getAttribute('width'), seal.getAttribute('height')]).toEqual(['13', '13']);
    // Only the scalloped rosette turns; the check stays upright.
    expect(badge.querySelector('.verified-badge__rosette path')).not.toBeNull();
    expect(badge.querySelector('.verified-badge__glow').getAttribute('aria-hidden')).toBe('true');
  });

  it('spins and glows subtly in CSS, sized from --vb-size, and stops for reduced motion', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const block = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
    expect(block('.verified-badge')).toMatch(/flex:\s*none/);
    expect(block('.verified-badge')).toMatch(/width:\s*var\(--vb-size\)/);
    expect(block('.verified-badge')).toMatch(/isolation:\s*isolate/);
    expect(block('.verified-badge__rosette')).toContain('animation: subtle-spin 12s linear infinite');
    expect(block('.verified-badge__glow')).toContain('subtle-spin 12s linear infinite');
    expect(css).toMatch(/@keyframes subtle-spin\s*{\s*to\s*{\s*transform:\s*rotate\(360deg\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.verified-badge__rosette,\s*\.verified-badge__glow\s*{\s*animation:\s*none/);
    expect(block('.avatar-seal')).toMatch(/z-index:\s*10/);
  });

  it('pins the seal on the avatar frame edge at every size, above the picture', async () => {
    for (const size of [20, 28, 72, 96]) {
      const { seal, box, offset } = avatarSealLayout(size);
      // Centre of the seal's disc sits on the circle at 45° (within a pixel).
      const centre = size - offset - box / 2;
      expect(Math.abs(centre - (size / 2) * (1 + Math.SQRT1_2))).toBeLessThanOrEqual(1);
      expect(seal).toBeGreaterThanOrEqual(12);
      expect(seal).toBeLessThanOrEqual(Math.max(12, size * 0.4));
    }
    await render(<UserAvatar name="Curva Sud" size={96} verified />);
    const avatar = container.querySelector('[data-user-avatar]');
    expect(avatar.className).toContain('isolate');
    const corner = avatar.querySelector('[data-avatar-seal]');
    expect(corner.className).toBe('avatar-seal');
    expect(corner.style.width).toBe(corner.style.height);
    expect(corner.querySelector('[data-verified-badge]').style.getPropertyValue('--vb-size')).toBe(`${avatarSealLayout(96).seal}px`);
  });
});

describe('profile dashboard', () => {
  beforeEach(() => {
    configureAuth({ storage: window.localStorage, credentials: null, iterations: 1000 });
    vi.stubGlobal('fetch', vi.fn(async () => json({ matches: [] })));
  });

  it('takes a guest through sign-up to a verified, editable profile', async () => {
    window.localStorage.setItem('eviv:chat:name', 'Fan1234');
    await render(<ProfileDashboard />);
    expect(container.querySelector('[data-profile-dashboard="guest"]')).not.toBeNull();
    expect(container.querySelector('[data-profile-hero]').textContent).toContain('Guest');
    expect(inputByLabel('Display name').value).toBe('Fan1234');

    typeInto(inputByLabel('Display name'), 'Curva Sud');
    typeInto(inputByLabel('Email'), 'fan@eviv.live');
    typeInto(inputByLabel('Password'), 'goal2026');
    await submit(container.querySelector('[data-auth-panel] form'));

    await waitFor(() => expect(container.querySelector('[data-profile-dashboard="authenticated"]')).not.toBeNull());
    const hero = container.querySelector('[data-profile-hero]');
    expect(hero.textContent).toContain('Curva Sud');
    expect(hero.textContent).toContain('Verified fan');
    expect(hero.querySelector('[data-verified-badge]')).not.toBeNull();
    expect(window.localStorage.getItem('eviv:auth:accounts')).not.toContain('goal2026');

    typeInto(inputByLabel('Display name'), 'Ultras 1899');
    await click(container.querySelector('button[aria-label="Use the Limon Lime avatar"]'));
    await submit(container.querySelector('[data-profile-editor]'));
    await waitFor(() => expect(container.querySelector('#profile-heading').textContent).toBe('Ultras 1899'));
    expect(JSON.parse(window.localStorage.getItem('eviv:auth:accounts'))[0]).toMatchObject({ displayName: 'Ultras 1899', avatarUrl: 'preset:eagle' });

    await click(buttonByText('Sign out'));
    await waitFor(() => expect(container.querySelector('[data-profile-dashboard="guest"]')).not.toBeNull());
  });

  it('reports a wrong password without signing in', async () => {
    await signUp({ email: 'fan@eviv.live', password: 'goal2026', displayName: 'Curva Sud' });
    configureAuth({ storage: window.localStorage, credentials: null, iterations: 1000 });
    window.localStorage.removeItem('eviv:auth:session');
    configureAuth({ storage: window.localStorage, credentials: null, iterations: 1000 });
    await render(<ProfileDashboard />);
    await click([...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.includes('Sign in')));
    typeInto(inputByLabel('Email'), 'fan@eviv.live');
    typeInto(inputByLabel('Password'), 'wrong1234');
    await submit(container.querySelector('[data-auth-panel] form'));
    await waitFor(() => expect(container.querySelector('[role="alert"]').textContent).toBe('Wrong email or password.'));
    expect(container.querySelector('[data-profile-dashboard="guest"]')).not.toBeNull();
  });

  it('computes prediction accuracy, starred teams and chat activity', async () => {
    const now = Date.now();
    const storage = window.localStorage;
    storage.setItem('eviv:vote:m1', JSON.stringify({ id: 'a', prediction: 'home', at: 1 }));
    storage.setItem('eviv:vote:m2', JSON.stringify({ id: 'b', prediction: 'draw', at: 2 }));
    storage.setItem('eviv:vote:m3', JSON.stringify({ id: 'c', prediction: 'away', at: 3 }));
    storage.setItem('eviv:vote:m4', JSON.stringify({ id: 'd', prediction: 'home', at: 4 }));
    storage.setItem(
      'eviv:fan:results',
      JSON.stringify({
        m1: { status: 'finished', homeScore: 1, awayScore: 0, homeName: 'AC Milan', awayName: 'Inter', checkedAt: now },
        m2: { status: 'finished', homeScore: 1, awayScore: 1, homeName: 'Raja CA', awayName: 'Wydad AC', checkedAt: now },
        m3: { status: 'finished', homeScore: 2, awayScore: 0, homeName: 'Arsenal', awayName: 'Chelsea', checkedAt: now },
      })
    );
    storage.setItem('fav_teams', JSON.stringify(['AC Milan', 'Raja CA']));
    storage.setItem('eviv:fan:chat', JSON.stringify({ messages: 7, reactions: 3, matches: ['m1', 'm2'], lastAt: now }));
    const fetchMock = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/api/match/m4')) {
        return json({ match: { status: 'finished', homeScore: 3, awayScore: 0, homeName: 'Real Madrid', awayName: 'Getafe' } });
      }
      // The wallet card / rewards store read the server wallet.
      if (target.includes('/api/wallet')) return json({ balance: 0, awards: [], redemptions: [], reward: 500, vipActive: false });
      return json({ match: null }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    await render(<ProfileDashboard />);
    const stats = () => container.querySelector('[data-fan-stats]');
    await waitFor(() => expect(stats().querySelector('svg[role="img"]').getAttribute('aria-label')).toBe('Prediction accuracy 75%'));
    // Exactly one fixture result is fetched (m1–m3 are already cached as finished).
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/match/'))).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/match/m4');
    expect(stats().textContent).toContain('Real Madrid to win');
    expect(stats().textContent).toContain('Starred teams');
    expect(stats().textContent).toContain('7 messages');
    expect(stats().textContent).toContain('2 matches · 3 reactions');
    expect(stats().querySelectorAll('[data-crest-drop]')).toHaveLength(2);
  });
});

describe('chat identity', () => {
  it('shows registered fans with the verified badge and tags their messages', async () => {
    configureAuth({ storage: window.localStorage, credentials: null, iterations: 1000 });
    await signUp({ email: 'fan@eviv.live', password: 'goal2026', displayName: 'Curva Sud' });
    await render(<MatchChatPanel matchId="espn-77" />);
    expect(container.textContent).toContain('Chatting as');
    expect(container.textContent).toContain('Curva Sud');
    expect(container.querySelector('[data-verified-badge]')).not.toBeNull();

    const input = container.querySelector('input[aria-label="Chat message"]');
    typeInto(input, 'Forza Milan!');
    await submit(input.closest('form'));
    await waitFor(() => {
      const rows = JSON.parse(window.localStorage.getItem('eviv:db:match_messages') || '[]');
      expect(rows.find((row) => row.message === 'Forza Milan!')).toMatchObject({ verified: true, username: 'Curva Sud' });
    });
    const row = JSON.parse(window.localStorage.getItem('eviv:db:match_messages')).find((r) => r.message === 'Forza Milan!');
    expect(row.user_id).toMatch(/^local-/);
    expect(JSON.parse(window.localStorage.getItem('eviv:fan:chat'))).toMatchObject({ messages: 1, matches: ['espn-77'] });
  });

  it('offers guests a path to verification', async () => {
    configureAuth({ storage: window.localStorage, credentials: null, iterations: 1000 });
    await render(<MatchChatPanel matchId="espn-78" />);
    expect(container.textContent).toContain('Get verified');
    expect(container.querySelector('a[href="/profile"]')).not.toBeNull();
  });
});
