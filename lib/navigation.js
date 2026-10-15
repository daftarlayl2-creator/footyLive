/**
 * Primary app destinations shared by the desktop header and the mobile
 * bottom tab bar. `isActive` also lights a tab up on its detail pages.
 */
export const PRIMARY_NAV = [
  {
    key: 'matches',
    href: '/',
    label: 'Matches',
    isActive: (path) => path === '/' || path.startsWith('/watch') || path.startsWith('/match/'),
  },
  {
    key: 'channels',
    href: '/channels',
    label: 'Live Channels',
    isActive: (path) => path.startsWith('/channels') || path.startsWith('/channel/'),
  },
  {
    key: 'standings',
    href: '/standings',
    label: 'Standings',
    isActive: (path) => path.startsWith('/standings') || path.startsWith('/club/') || path.startsWith('/player/'),
  },
  {
    key: 'multiview',
    href: '/multistream',
    label: 'Multi-View',
    isActive: (path) => path.startsWith('/multistream'),
  },
];

export function activeNavKey(pathname) {
  const path = pathname || '/';
  return PRIMARY_NAV.find((item) => item.isActive(path))?.key ?? null;
}
