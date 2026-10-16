import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import contract from './__fixtures__/common-soccer-yamal.json';
import { normalizePlayerProfile } from './normalize';
const upstream = vi.hoisted(() => vi.fn());
vi.mock('@/lib/providers/espn', () => ({ espnFetch: upstream }));
// Portrait enrichment (TheSportsDB) stays offline in contract tests.
vi.mock('@/lib/providers/http', () => ({ fetchJson: vi.fn(async () => ({ player: null })) }));
vi.mock('@/lib/cache/cacheManager', () => ({ getCacheManager: () => ({ swr: (_key: string, load: () => unknown) => load() }) }));
vi.mock('@/lib/logger', () => ({ default: { warn: vi.fn() } }));
import { getPlayerProfile, PlayerDataUnavailableError } from './playerProfile';

beforeEach(() => { upstream.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('verified ESPN soccer contracts', () => {
  it('joins separate identity and stats-only overview endpoints for a direct player link', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/362150/overview')) return contract.overview;
      if (url.endsWith('/all/athletes/362150')) return contract.identity;
      throw new Error('HTTP 404');
    });
    const profile = await getPlayerProfile('362150');
    expect(profile).toMatchObject({
      name: 'Lamine Yamal', dateOfBirth: '2007-07-13', age: 19,
      club: { id: '83', league: 'esp.1' },
      season: { label: '2026-27 LALIGA', current: true, appearances: 8, goals: 7, assists: 5 },
      // Current Transfermarkt market value (October 2026 update).
      marketValue: { asOf: '2026-10-09', amount: 220_000_000 },
    });
    expect(profile?.season.minutes).toBeUndefined();
    expect(profile?.season.passAccuracy).toBeUndefined();
    expect(upstream).toHaveBeenCalledWith(expect.stringContaining('/esp.1/teams/83/roster'), 600);
  });

  it('does not mistake the first international or Champions League split for the domestic club season', () => {
    const data = { ...contract.identity, ...contract.overview };
    const profile = normalizePlayerProfile(data)!;
    expect(profile.season).toMatchObject({ goals: 7, assists: 5, appearances: 8, scope: 'LALIGA' });
    expect(profile.season.goals).not.toBe(4);
    expect(profile.season.assists).not.toBe(4);
  });

  it('does not infer appearances from starts alone or normalize an invalid display DOB', () => {
    const data = structuredClone(contract.identity);
    data.athlete.displayDOB = '31/2/2007';
    data.athlete.statsSummary.statistics[0].displayValue = '8';
    const profile = normalizePlayerProfile(data)!;
    expect(profile.dateOfBirth).toBeUndefined();
    expect(profile.season.appearances).toBeUndefined();
  });

  it('can use the clicked real roster when the successful overview contains statistics but no identity', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/overview')) return contract.overview;
      if (url.endsWith('/teams/83/roster')) return { team: contract.identity.athlete.team, athletes: [{ ...contract.identity.athlete, dateOfBirth: '2007-07-13' }] };
      throw new Error('HTTP 404');
    });
    expect(await getPlayerProfile('362150', '83', 'esp.1')).toMatchObject({ name: 'Lamine Yamal', club: { id: '83' } });
  });

  it('treats an identity outage as retryable even when a stats-only overview is available', async () => {
    upstream.mockImplementation(async (url: string) => {
      if (url.endsWith('/overview')) return contract.overview;
      throw new Error('HTTP 503');
    });
    await expect(getPlayerProfile('362150')).rejects.toBeInstanceOf(PlayerDataUnavailableError);
  });
});
