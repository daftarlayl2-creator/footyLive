/** Server metadata wrapper — `page.js` here is a client component and cannot export metadata. */
export const metadata = {
  title: 'Mounadel Command Center — Limon Live',
  description: 'Internal operations console for Limon Live league moderators and support managers.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/mounadel' },
};

export default function MounadelLayout({ children }) {
  return children;
}
