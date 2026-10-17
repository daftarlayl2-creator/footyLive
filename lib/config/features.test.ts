import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLiveTvEnabled } from './features';

describe('Live TV feature flag', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is hidden by default (unset, empty, or any non-"true" value)', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', '');
    expect(isLiveTvEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'false');
    expect(isLiveTvEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', '1');
    expect(isLiveTvEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'TRUE');
    expect(isLiveTvEnabled()).toBe(false);
  });

  it('is enabled only by the exact value "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVE_TV_ENABLED', 'true');
    expect(isLiveTvEnabled()).toBe(true);
  });
});
