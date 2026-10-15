import { describe, expect, it } from 'vitest';
import { HEALTH_STALE_MS, freshHealth, isStreamHealth, rankStreams, type StreamHealth } from './health';
import { failoverReducer, initFailoverState, pickNextServer } from './servers';

const health = (status: StreamHealth['status'], latencyMs: number | null = null, successRate = status === 'live' ? 1 : 0): StreamHealth => ({ status, latencyMs, successRate, checkedAt: Date.now(), samples: 5 });

describe('smart stream ranking', () => {
  it('ranks reachability, recent stability and speed ahead of raw resolution', () => {
    const sources = [
      { id: 'gone', quality: 'FHD', health: health('offline') },
      { id: 'slow-fhd', quality: 'FHD', health: health('live', 900) },
      { id: 'flaky-fhd', quality: 'FHD', health: health('live', 10, 0.4) },
      { id: 'fast-hd', quality: 'HD', health: health('live', 40) },
      { id: 'blocked', quality: 'FHD', health: health('unknown') },
    ];
    expect(rankStreams(sources).map((source) => source.id)).toEqual(['fast-hd', 'slow-fhd', 'flaky-fhd', 'blocked', 'gone']);
  });

  it('prefers FHD when speed and stability are comparable, with deterministic ties', () => {
    expect(rankStreams([{ id: 'hd', quality: 'HD', health: health('live', 100) }, { id: 'fhd', quality: 'FHD', health: health('live', 120) }])[0].id).toBe('fhd');
    expect(rankStreams([{ id: 'a', quality: 'Auto' }, { id: 'b', quality: 'Auto' }]).map((source) => source.id)).toEqual(['a', 'b']);
  });

  it('does not promote an unrelated channel over a viable match-specific source', () => {
    const verified = { id: 'specific', provider: 'livefeed', health: health('unknown') };
    const backup = { id: 'backup', provider: 'livefeed-fallback', quality: 'FHD', health: health('live', 10) };
    expect(rankStreams([backup, verified])[0].id).toBe('specific');
    expect(rankStreams([backup, { ...verified, health: health('offline') }])[0].id).toBe('backup');
  });

  it('prefers an explicit working broadcaster over generic sports, but not over a working fixture source', () => {
    const generic = { id: 'generic', provider: 'iptv-org-fallback-sports', coverage: 'sports' as const, health: health('live', 1) };
    const network = { id: 'network', provider: 'iptv-org-fallback-broadcaster', coverage: 'broadcaster' as const, health: health('live', 300) };
    const fixture = { id: 'fixture', provider: 'iptv-org', coverage: 'fixture' as const, health: health('live', 800) };
    expect(rankStreams([generic, network, fixture]).map(({ id }) => id)).toEqual(['fixture', 'network', 'generic']);
    expect(rankStreams([generic, { ...network, health: health('unknown') }])[0].id).toBe('generic');
  });

  it('ages old observations back to unknown and validates health payloads', () => {
    const sample = health('offline');
    expect(freshHealth(sample, sample.checkedAt + HEALTH_STALE_MS + 1)).toBeUndefined();
    expect(freshHealth(sample, sample.checkedAt + 1)).toBe(sample);
    expect(freshHealth({ ...sample, checkedAt: sample.checkedAt + HEALTH_STALE_MS }, sample.checkedAt)).toBeUndefined();
    expect(freshHealth(sample, sample.checkedAt - 1000)).toBe(sample);
    expect(isStreamHealth({ ...sample, latencyMs: -1 })).toBe(false);
    expect(isStreamHealth({ ...sample, successRate: 2 })).toBe(false);
    expect(isStreamHealth(sample)).toBe(true);
    expect(isStreamHealth({ ...sample, mediaVerified: 'yes' })).toBe(false);
  });
});

describe('health-driven failover', () => {
  it('optimizes the startup source once, without interrupting healthy playback on later probes', () => {
    let state = initFailoverState(['slow', 'fast']);
    state = failoverReducer(state, { type: 'sync', keys: ['fast', 'slow'] });
    state = failoverReducer(state, { type: 'health', preferredKey: 'fast', health: { slow: health('live', 900), fast: health('live', 40) } });
    expect(state.keys[state.active]).toBe('fast');
    expect(state.attempt).toBe(2);
    state = failoverReducer(state, { type: 'ready', attempt: 2 });
    state = failoverReducer(state, { type: 'health', preferredKey: 'slow', health: { slow: health('live', 10), fast: health('live', 100) } });
    expect(state.keys[state.active]).toBe('fast');
    expect(state.attempt).toBe(2);
  });

  it('automatically skips confirmed-offline channels and selects the top ranked active backup', () => {
    let state = initFailoverState(['best', 'offline', 'current', 'slow']);
    state = failoverReducer(state, { type: 'select', index: 2 });
    state = failoverReducer(state, { type: 'ready', attempt: state.attempt });
    state = failoverReducer(state, { type: 'health', preferredKey: 'best', health: {
      best: health('live', 20), offline: health('offline'), current: health('offline'), slow: health('live', 800),
    } });
    expect(state.keys[state.active]).toBe('best');
    expect(state.switched?.reason).toBe('health');
    expect(state.failed.current).toBe('health');
    expect(pickNextServer(['a', 'b', 'c'], 0, ['a'], {}, undefined, { b: health('offline'), c: health('live', 10) })).toBe(2);
  });

  it('preserves manual choices and disabled auto-switch preferences', () => {
    let manual = failoverReducer(initFailoverState(['best', 'manual']), { type: 'select', index: 1 });
    manual = failoverReducer(manual, { type: 'health', preferredKey: 'best', health: { best: health('live', 10), manual: health('unknown') } });
    expect(manual.keys[manual.active]).toBe('manual');
    let disabled = initFailoverState(['a', 'b'], false);
    disabled = failoverReducer(disabled, { type: 'health', preferredKey: 'b', health: { a: health('offline'), b: health('live', 10) } });
    expect(disabled.active).toBe(0);
  });

  it('treats CDN-blocked probes as standby, not automatic failures', () => {
    const state = failoverReducer(initFailoverState(['a', 'b']), { type: 'health', health: { a: health('unknown'), b: health('unknown') } });
    expect(state).toMatchObject({ active: 0, attempt: 1, phase: 'connecting', failed: {} });
  });

  it('recovers from all-offline exhaustion when a later ping confirms a source has returned', () => {
    let state = failoverReducer(initFailoverState(['a', 'b']), { type: 'health', health: { a: health('offline'), b: health('offline') } });
    expect(state.phase).toBe('exhausted');
    state = failoverReducer(state, { type: 'health', preferredKey: 'b', health: { a: health('offline'), b: health('live', 30) } });
    expect(state.keys[state.active]).toBe('b');
    expect(state.phase).toBe('connecting');
  });
});
