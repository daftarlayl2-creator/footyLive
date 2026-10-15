/** Keep the legacy name list intact; optional crest/id metadata lives beside it. */
export function getFavoriteTeams() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem('fav_teams') || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((name) => typeof name === 'string' && name.trim()))] : [];
  } catch {
    return [];
  }
}

export function getFavoriteTeamDetails() {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem('fav_team_details') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function isTeamFavorited(teamName) {
  if (!teamName) return false;
  return getFavoriteTeams().some((name) => name.toLowerCase() === teamName.toLowerCase());
}

export function toggleFavoriteTeam(team) {
  const teamName = typeof team === 'string' ? team : team?.name;
  if (typeof window === 'undefined' || typeof teamName !== 'string' || !teamName.trim()) return false;
  try {
    const favs = getFavoriteTeams();
    const index = favs.findIndex((name) => name.toLowerCase() === teamName.toLowerCase());
    if (index >= 0) favs.splice(index, 1);
    else favs.push(teamName);
    window.localStorage.setItem('fav_teams', JSON.stringify(favs));
    // Metadata failure must not prevent the core favorites list from updating.
    try {
      const details = getFavoriteTeamDetails();
      const key = teamName.toLowerCase();
      if (index >= 0) delete details[key];
      else if (typeof team === 'object') details[key] = { name: teamName, id: team.id, badge: team.badge || team.logo || '' };
      window.localStorage.setItem('fav_team_details', JSON.stringify(details));
    } catch { /* Storage quota: fall back to initials. */ }
    window.dispatchEvent(new Event('favorites-updated'));
    return index < 0;
  } catch {
    return false;
  }
}
