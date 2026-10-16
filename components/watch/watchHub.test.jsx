// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The player itself is a big client component; this test watches the source list
// the hub hands it, which is what the manual channel list has to change.
vi.mock('@/components/StreamPlayer', () => ({
  default: ({ channels, streamUrl, matchTitle }) => (
    <div data-player data-stream-url={streamUrl || ''} data-title={matchTitle}>
      {(channels || []).map((channel) => <span key={channel.url} data-player-server={channel.name} />)}
    </div>
  ),
}));

import WatchStreamHub from './WatchStreamHub';
import LiveChannelPicker from './LiveChannelPicker';

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
  vi.clearAllMocks();
});
const render = async (element) => { await act(async () => root.render(element)); };
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
// React tracks the input's value internally, so set it through the native setter.
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

const CHANNELS = {
  counts: { live: 1, standby: 1, offline: 1, total: 3 },
  channels: [
    { id: 'bein-1', name: 'beIN SPORTS 1', group: 'Sports', status: 'live', quality: 'FHD', href: '/channel/bein-1' },
    { id: 'sky-1', name: 'Sky Sports PL', group: 'Sports', status: 'unknown', quality: 'HD', href: '/channel/sky-1' },
    { id: 'dead-1', name: 'Offline TV', group: 'General', status: 'offline', href: '/channel/dead-1' },
  ],
};

function stubFeeds({ streamsByChannel = {} } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const target = String(url);
    if (target.startsWith('/api/live-channels')) return { ok: true, json: async () => CHANNELS };
    const match = /\/api\/channels\/([^/]+)\/streams/.exec(target);
    if (match) {
      const payload = streamsByChannel[decodeURIComponent(match[1])];
      if (!payload) return { ok: false, json: async () => ({ error: 'Channel not found in the current feeds.' }) };
      return { ok: true, json: async () => payload };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('manual live channel list on the watch page', () => {
  it('lists every aggregated channel with its status, standby rows included', async () => {
    stubFeeds();
    await render(<LiveChannelPicker onPlay={() => {}} matchTitle="Arsenal vs Liverpool" />);
    await settle();
    const rows = [...container.querySelectorAll('[data-live-channel-picker] li')];
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('beIN SPORTS 1'), expect.stringContaining('Sky Sports PL'), expect.stringContaining('Offline TV'),
    ]);
    expect(container.textContent).toContain('3 total');
    // Standby (blocked probe) is still playable — it is never a dead end.
    expect(container.textContent).toContain('Standby');
    expect(rows[1].querySelector('button').disabled).toBe(false);
  });

  it('filters the list as the viewer searches', async () => {
    stubFeeds();
    await render(<LiveChannelPicker onPlay={() => {}} />);
    await settle();
    typeInto(container.querySelector('input[type="search"]'), 'sky');
    const rows = [...container.querySelectorAll('[data-live-channel-picker] li')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Sky Sports PL');
  });

  it('resolves the signed streams for a tapped channel and hands them to the player', async () => {
    stubFeeds({
      streamsByChannel: {
        'bein-1': {
          lockedCount: 0,
          defaultUrl: '/api/proxy?url=bein',
          streams: [{ name: 'beIN SPORTS 1', url: '/api/proxy?url=bein', proxiedUrl: '/api/proxy?url=bein', kind: 'hls', quality: 'FHD' }],
        },
      },
    });
    const onPlay = vi.fn();
    await render(<LiveChannelPicker onPlay={onPlay} />);
    await settle();
    await act(async () => container.querySelector('button[aria-label^="Play beIN SPORTS 1"]').click());
    await settle();
    expect(onPlay).toHaveBeenCalledOnce();
    expect(onPlay.mock.calls[0][0]).toMatchObject({
      channel: { id: 'bein-1', name: 'beIN SPORTS 1' },
      defaultUrl: '/api/proxy?url=bein',
      lockedCount: 0,
    });
  });

  it('explains a failed channel instead of leaving a blank player', async () => {
    stubFeeds();
    await render(<LiveChannelPicker onPlay={() => {}} />);
    await settle();
    await act(async () => container.querySelector('button[aria-label^="Play beIN SPORTS 1"]').click());
    await settle();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Channel not found in the current feeds.');
  });
});

describe('watch stream hub', () => {
  const matchChannels = [{ name: 'Server 1', url: '/api/proxy?url=match', proxiedUrl: '/api/proxy?url=match', kind: 'hls' }];

  it('swaps the player onto the selected channel and back to the match servers', async () => {
    stubFeeds({
      streamsByChannel: {
        'sky-1': {
          lockedCount: 2,
          defaultUrl: '/api/proxy?url=sky',
          streams: [{ name: 'Sky Sports PL', url: '/api/proxy?url=sky', proxiedUrl: '/api/proxy?url=sky', kind: 'hls', quality: 'HD' }],
        },
      },
    });
    await render(
      <WatchStreamHub
        matchId="espn-700001"
        streamUrl={matchChannels[0].url}
        channels={matchChannels}
        matchTitle="Arsenal vs Liverpool"
        matchStatus="live"
      />
    );
    await settle();
    expect(container.querySelector('[data-player-server="Server 1"]')).not.toBeNull();

    await act(async () => container.querySelector('button[aria-label^="Play Sky Sports PL"]').click());
    await settle();
    // The player now plays the chosen channel, and the way back is one tap away.
    expect(container.querySelector('[data-player]').getAttribute('data-stream-url')).toBe('/api/proxy?url=sky');
    expect(container.querySelector('[data-player-server="Sky Sports PL"]')).not.toBeNull();
    expect(container.querySelector('[data-player-server="Server 1"]')).toBeNull();
    expect(container.textContent).toContain('Now playing channel: Sky Sports PL');

    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Back to match servers')).click());
    await settle();
    expect(container.querySelector('[data-player-server="Server 1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Now playing channel');
  });

  it('always renders the channel list next to the player, even with no match server resolved', async () => {
    stubFeeds();
    await render(<WatchStreamHub matchId="espn-700002" streamUrl={null} channels={[]} matchTitle="Real Madrid vs Roma" matchStatus="live" />);
    await settle();
    expect(container.querySelector('[data-live-channel-picker]')).not.toBeNull();
    expect(container.querySelectorAll('[data-live-channel-picker] li')).toHaveLength(3);
  });
});
