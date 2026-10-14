import { describe, it, expect } from 'vitest';
import {
  buildServerList,
  describeFailure,
  detectStreamKind,
  failoverReducer,
  initFailoverState,
  joinLabels,
  normalizeQuality,
  pickNextServer,
  serverKey,
  serverLabel,
  type FailoverAction,
  type FailoverState,
} from './servers';
import { buildProxyUrl } from '../hlsProxy';
import { getStreamRedirectUrl } from '../streamEngine';

const proxied = (url: string, expiresAt?: number) => buildProxyUrl(url, { expiresAt });

describe('serverLabel', () => {
  it('numbers servers and names the last of several "Backup"', () => {
    expect([0, 1, 2].map((i) => serverLabel(i, 3))).toEqual(['Server 1', 'Server 2', 'Backup']);
    expect([0, 1].map((i) => serverLabel(i, 2))).toEqual(['Server 1', 'Backup']);
  });

  it('never calls a lone server "Backup"', () => {
    expect(serverLabel(0, 1)).toBe('Server 1');
  });
});

describe('normalizeQuality', () => {
  it('maps every HD flavour to HD and everything else to SD', () => {
    for (const q of ['HD', 'hd', 'FHD', '1080p', '720P', '4K', ' uhd ']) expect(normalizeQuality(q)).toBe('HD');
    for (const q of ['SD', '480p', '', undefined, null, 'auto']) expect(normalizeQuality(q)).toBe('SD');
  });
});

describe('detectStreamKind', () => {
  it('classifies raw URLs', () => {
    expect(detectStreamKind('https://cdn.example.com/live/index.m3u8?token=1')).toBe('hls');
    expect(detectStreamKind('https://cdn.example.com/hls/live/2120302/stream')).toBe('hls');
    expect(detectStreamKind('https://cdn.example.com/vod/match.mp4')).toBe('mp4');
    expect(detectStreamKind('https://embed.example.com/player/42')).toBe('embed');
    expect(detectStreamKind('')).toBeNull();
    expect(detectStreamKind(undefined)).toBeNull();
  });

  it('prefers the playlist over an .mp4 folder name (Wowza-style URLs)', () => {
    expect(detectStreamKind('https://cdn.example.com/vod/mp4:match.mp4/playlist.m3u8')).toBe('hls');
  });

  it('looks inside signed proxy links, where "/hls/" is URL-encoded', () => {
    const hlsPath = proxied('https://sonydaimenew.akamaized.net/hls/live/2120302/Footlive1410/ENG/stream');
    expect(hlsPath).not.toContain('/hls/');
    expect(detectStreamKind(hlsPath)).toBe('hls');
    expect(detectStreamKind(proxied('https://cdn.example.com/a/index.m3u8'))).toBe('hls');
    expect(detectStreamKind(proxied('https://cdn.example.com/vod/clip.mp4'))).toBe('mp4');
    // Extension-less endpoints are playlists the proxy sniffs.
    expect(detectStreamKind(proxied('https://cdn.example.com/live.php?id=1'))).toBe('hls');
  });

  it('treats signed redirect links as embeds', () => {
    expect(detectStreamKind(getStreamRedirectUrl('https://embed.example.com/e/1'))).toBe('embed');
  });
});

describe('serverKey', () => {
  it('is stable across re-signing of the same upstream link', () => {
    const a = proxied('https://cdn.example.com/a/index.m3u8', Date.now() + 1000);
    const b = proxied('https://cdn.example.com/a/index.m3u8', Date.now() + 2000);
    expect(a).not.toBe(b);
    expect(serverKey(a)).toBe(serverKey(b));
    expect(serverKey(a)).not.toBe(serverKey(proxied('https://cdn.example.com/b/index.m3u8')));
  });

  it('keys redirect links by their encoded target and leaves other URLs untouched', () => {
    const r = getStreamRedirectUrl('https://embed.example.com/e/1');
    expect(serverKey(r)).toBe(`redirect:${Buffer.from('https://embed.example.com/e/1').toString('base64url')}`);
    expect(serverKey('https://x.example.com/live.m3u8')).toBe('https://x.example.com/live.m3u8');
  });
});

describe('buildServerList', () => {
  it('labels servers, prefers proxied URLs and normalises quality', () => {
    const servers = buildServerList([
      { name: 'Server 1', url: 'https://raw.example.com/a.m3u8', proxiedUrl: proxied('https://raw.example.com/a.m3u8'), quality: 'FHD' },
      { name: 'Server 2', url: 'https://embed.example.com/e/2', proxiedUrl: getStreamRedirectUrl('https://embed.example.com/e/2') },
      { name: 'Server 3', url: 'https://raw.example.com/c.mp4', quality: '720p' },
    ]);
    expect(servers.map((s) => s.label)).toEqual(['Server 1', 'Server 2', 'Backup']);
    expect(servers.map((s) => s.kind)).toEqual(['hls', 'embed', 'mp4']);
    expect(servers.map((s) => s.quality)).toEqual(['HD', 'SD', 'HD']);
    expect(servers[0].url.startsWith('/api/proxy?')).toBe(true);
    expect(servers.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('trusts an explicit kind from the server and ignores bogus ones', () => {
    const [a, b] = buildServerList([
      { url: 'https://example.com/live', kind: 'hls' },
      { url: 'https://example.com/other', kind: 'flash' },
    ]);
    expect(a.kind).toBe('hls');
    expect(b.kind).toBe('embed');
  });

  it('skips channels without a URL and drops duplicates before labelling', () => {
    const servers = buildServerList([
      { name: 'empty' },
      { url: proxied('https://cdn.example.com/a.m3u8', Date.now() + 1) },
      { url: proxied('https://cdn.example.com/a.m3u8', Date.now() + 2) },
      { url: 'https://cdn.example.com/b.m3u8' },
    ]);
    expect(servers.map((s) => s.label)).toEqual(['Server 1', 'Backup']);
  });

  it('falls back to streamUrl only when no channel is usable', () => {
    expect(buildServerList([], 'https://cdn.example.com/x.m3u8')).toMatchObject([{ label: 'Server 1', kind: 'hls' }]);
    expect(buildServerList(null, null)).toEqual([]);
    expect(buildServerList([{ url: 'https://a.example.com/1.m3u8' }], 'https://b.example.com/2.m3u8')).toHaveLength(1);
  });
});

describe('pickNextServer', () => {
  const keys = ['a', 'b', 'c', 'd'];

  it('walks forward and wraps around, skipping servers tried in this chain', () => {
    expect(pickNextServer(keys, 0, ['a'], {})).toBe(1);
    expect(pickNextServer(keys, 2, ['b', 'c'], {})).toBe(3);
    expect(pickNextServer(keys, 3, ['c', 'd'], {})).toBe(0);
    expect(pickNextServer(keys, 0, keys, {})).toBe(-1);
  });

  it('tries servers that failed in an earlier chain last', () => {
    expect(pickNextServer(keys, 0, ['a'], { b: 'network' })).toBe(2);
    expect(pickNextServer(keys, 0, ['a', 'c', 'd'], { b: 'network' })).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

function run(state: FailoverState, ...actions: FailoverAction[]): FailoverState {
  return actions.reduce(failoverReducer, state);
}

const KEYS = ['s1', 's2', 'backup'];

describe('failoverReducer: automatic failover', () => {
  it('starts on Server 1 and becomes ready', () => {
    const s = run(initFailoverState(KEYS), { type: 'ready', attempt: 1 });
    expect(s).toMatchObject({ active: 0, phase: 'ready', attempt: 1, tried: ['s1'] });
  });

  it('moves to the next server when the current one fails', () => {
    const s = run(initFailoverState(KEYS), { type: 'fail', attempt: 1, reason: 'network' });
    expect(s).toMatchObject({ active: 1, phase: 'connecting', attempt: 2, tried: ['s1', 's2'] });
    expect(s.failed).toEqual({ s1: 'network' });
    expect(s.switched).toEqual({ from: 0, to: 1, reason: 'network' });
  });

  it('walks Server 1 → Server 2 → Backup, then reports every server exhausted', () => {
    let s = initFailoverState(KEYS);
    s = run(s, { type: 'fail', attempt: 1, reason: 'network' }, { type: 'fail', attempt: 2, reason: 'media' });
    expect(s).toMatchObject({ active: 2, phase: 'connecting', attempt: 3 });
    s = run(s, { type: 'fail', attempt: 3, reason: 'timeout' });
    expect(s).toMatchObject({ active: 2, phase: 'exhausted', switched: null });
    expect(s.failed).toEqual({ s1: 'network', s2: 'media', backup: 'timeout' });
  });

  it('ignores events from a player that has already been replaced', () => {
    const s = run(initFailoverState(KEYS), { type: 'fail', attempt: 1, reason: 'network' });
    expect(run(s, { type: 'fail', attempt: 1, reason: 'media' })).toBe(s);
    expect(run(s, { type: 'ready', attempt: 1 })).toBe(s);
    expect(run(s, { type: 'stable', attempt: 1 })).toBe(s);
  });

  it('handles mid-stream failures after playback started', () => {
    const s = run(initFailoverState(KEYS), { type: 'ready', attempt: 1 }, { type: 'fail', attempt: 1, reason: 'stalled' });
    expect(s).toMatchObject({ active: 1, phase: 'connecting', switched: { from: 0, to: 1, reason: 'stalled' } });
  });

  it('a lone server that fails is exhausted immediately', () => {
    const s = run(initFailoverState(['only']), { type: 'fail', attempt: 1, reason: 'network' });
    expect(s.phase).toBe('exhausted');
  });

  it('resets the chain after stable playback so earlier servers get another chance', () => {
    let s = run(
      initFailoverState(KEYS),
      { type: 'fail', attempt: 1, reason: 'network' }, // s1 ✗ → s2
      { type: 'ready', attempt: 2 },
      { type: 'stable', attempt: 2 }
    );
    expect(s.tried).toEqual(['s2']);
    s = run(s, { type: 'fail', attempt: 2, reason: 'network' }); // s2 dies 40 minutes later
    expect(s.active).toBe(2); // fresh Backup first …
    s = run(s, { type: 'fail', attempt: 3, reason: 'network' });
    expect(s).toMatchObject({ active: 0, phase: 'connecting' }); // … then the server that failed long ago
    expect(s.failed.s1).toBeUndefined();
  });

  it('without stable playback, a flapping chain still ends instead of looping', () => {
    let s = initFailoverState(KEYS);
    for (let attempt = 1; attempt <= 3; attempt++) {
      s = run(s, { type: 'ready', attempt }, { type: 'fail', attempt, reason: 'stalled' });
    }
    expect(s.phase).toBe('exhausted');
  });
});

describe('failoverReducer: manual control', () => {
  it('stops on the failed server when auto-switch is off', () => {
    const s = run(
      initFailoverState(KEYS),
      { type: 'setAutoSwitch', enabled: false },
      { type: 'fail', attempt: 1, reason: 'network' }
    );
    expect(s).toMatchObject({ active: 0, phase: 'failed', attempt: 1 });
    const next = run(s, { type: 'next' });
    expect(next).toMatchObject({ active: 1, phase: 'connecting', attempt: 2 });
  });

  it('selecting a server starts a new chain and clears its failure mark', () => {
    let s = run(initFailoverState(KEYS), { type: 'fail', attempt: 1, reason: 'network' }, { type: 'ready', attempt: 2 });
    s = run(s, { type: 'select', index: 0 });
    expect(s).toMatchObject({ active: 0, phase: 'connecting', attempt: 3, tried: ['s1'], switched: null });
    expect(s.failed).toEqual({});
  });

  it('does not restart the server that is already playing', () => {
    const s = run(initFailoverState(KEYS), { type: 'ready', attempt: 1 });
    expect(run(s, { type: 'select', index: 0 })).toBe(s);
    expect(run(s, { type: 'select', index: 7 })).toBe(s);
  });

  it('reload restarts the active server with a new attempt', () => {
    const s = run(initFailoverState(KEYS), { type: 'ready', attempt: 1 }, { type: 'reload' });
    expect(s).toMatchObject({ active: 0, phase: 'connecting', attempt: 2 });
  });

  it('retryAll forgets failures and starts from Server 1', () => {
    let s = initFailoverState(KEYS);
    s = run(s, ...[1, 2, 3].map((attempt) => ({ type: 'fail', attempt, reason: 'network' }) as FailoverAction));
    expect(s.phase).toBe('exhausted');
    s = run(s, { type: 'retryAll' });
    expect(s).toMatchObject({ active: 0, phase: 'connecting', failed: {}, tried: ['s1'] });
  });

  it('dismissSwitch clears the auto-switch notice', () => {
    const s = run(initFailoverState(KEYS), { type: 'fail', attempt: 1, reason: 'network' }, { type: 'dismissSwitch' });
    expect(s.switched).toBeNull();
  });
});

describe('failoverReducer: server list changes', () => {
  it('ignores an identical list (e.g. re-signed links)', () => {
    const s = initFailoverState(KEYS);
    expect(run(s, { type: 'sync', keys: [...KEYS] })).toBe(s);
  });

  it('keeps playing the same server when the list is reordered or extended', () => {
    const s = run(initFailoverState(KEYS), { type: 'select', index: 1 }, { type: 'ready', attempt: 2 });
    const synced = run(s, { type: 'sync', keys: ['new', 's2', 's1', 'backup'] });
    expect(synced).toMatchObject({ active: 1, attempt: 2, phase: 'ready' });
  });

  it('starts over when the playing server disappears', () => {
    const s = run(initFailoverState(KEYS), { type: 'ready', attempt: 1 }, { type: 'sync', keys: ['x', 'y'] });
    expect(s).toMatchObject({ active: 0, attempt: 2, phase: 'connecting', tried: ['x'] });
  });

  it('retries automatically when fresh servers arrive after everything failed', () => {
    let s = run(initFailoverState(['a']), { type: 'fail', attempt: 1, reason: 'network' });
    expect(s.phase).toBe('exhausted');
    s = run(s, { type: 'sync', keys: ['a', 'b'] });
    expect(s).toMatchObject({ active: 1, phase: 'connecting', attempt: 2 });
  });
});

describe('copy helpers', () => {
  it('describes failures and joins labels', () => {
    expect(describeFailure('network')).toMatch(/offline/i);
    expect(describeFailure(null)).toBe('Stream unavailable');
    expect(joinLabels(['Server 1'])).toBe('Server 1');
    expect(joinLabels(['Server 1', 'Backup'])).toBe('Server 1 and Backup');
    expect(joinLabels(['Server 1', 'Server 2', 'Backup'])).toBe('Server 1, Server 2 and Backup');
  });
});
