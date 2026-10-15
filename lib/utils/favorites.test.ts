// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFavoriteTeams, getFavoriteTeamDetails, isTeamFavorited, toggleFavoriteTeam } from './favorites';
beforeEach(() => { window.localStorage.clear(); });

describe('backward-compatible favorites', () => {
  it('reads legacy name-only lists and rejects malformed data', () => {
    window.localStorage.setItem('fav_teams', '["Arsenal","Madrid"]');
    expect(getFavoriteTeams()).toEqual(['Arsenal', 'Madrid']);
    expect(isTeamFavorited('ARSENAL')).toBe(true);
    for (const raw of ['{oops', '{}', 'null', '[12,null,{}]']) {
      window.localStorage.setItem('fav_teams', raw);
      expect(getFavoriteTeams()).toEqual([]);
    }
  });
  it('persists high-resolution crest metadata without changing the legacy list shape', () => {
    const listener = vi.fn();
    window.addEventListener('favorites-updated', listener);
    const team = { id: '359', name: 'Arsenal', badge: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png' };
    expect(toggleFavoriteTeam(team)).toBe(true);
    expect(getFavoriteTeams()).toEqual(['Arsenal']);
    expect(getFavoriteTeamDetails().arsenal).toEqual(team);
    expect(toggleFavoriteTeam('ARSENAL')).toBe(false);
    expect(getFavoriteTeams()).toEqual([]);
    expect(getFavoriteTeamDetails()).toEqual({});
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener('favorites-updated', listener);
  });
  it('supports old callers and ignores nameless entries', () => {
    expect(toggleFavoriteTeam('Madrid')).toBe(true);
    expect(toggleFavoriteTeam({ name: '' })).toBe(false);
    expect(getFavoriteTeams()).toEqual(['Madrid']);
  });
});
