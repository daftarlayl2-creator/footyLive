/** Server metadata wrapper — `page.js` here is a client component and cannot export metadata. */
export const metadata = {
  title: 'Match Highlights & Goals — Limon Live',
  description:
    'Watch football highlights and goals from today’s matches: key moments, red cards and standout saves, embedded from the official YouTube player on Limon Live.',
  alternates: { canonical: '/highlights' },
};

export default function HighlightsLayout({ children }) {
  return children;
}
