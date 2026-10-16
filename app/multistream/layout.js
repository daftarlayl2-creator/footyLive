/** Server metadata wrapper — `page.js` here is a client component and cannot export metadata. */
export const metadata = {
  title: 'Multi-View — Four Live Matches at Once | Limon Live',
  description: 'Follow up to four live football matches at once with independent audio and automatic stream fallback. Multi-View on Limon Live VIP passes.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/multistream' },
};

export default function MultiStreamLayout({ children }) {
  return children;
}
