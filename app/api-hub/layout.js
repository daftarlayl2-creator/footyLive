/** Server metadata wrapper — `page.js` here is a client component and cannot export metadata. */
export const metadata = {
  title: 'Developer API Hub — Limon Live',
  description: 'Internal developer dashboard for Limon Live upstream stream APIs, endpoint signatures and provider metadata.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/api-hub' },
};

export default function ApiHubLayout({ children }) {
  return children;
}
