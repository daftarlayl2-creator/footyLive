import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'About — Limon Live',
  description: 'What Limon Live is, where its football data comes from, and how streams reach the site.',
  alternates: { canonical: '/about' },
};

/* Owner: confirm the company/operator description and any registered details
   before launch — this page intentionally states no legal entity, address,
   or registration number. */
export default function AboutPage() {
  return (
    <LegalPage
      title="About Limon Live"
      intro="Limon Live is a football matchday companion: today's fixtures, live scores and minutes, results, statistics, highlights and fan features in one place."
    >
      <section>
        <h2>What we do</h2>
        <p>
          We bring together fixture lists, live scoreboards, lineups, match statistics and recent results so fans can
          follow a full day of football without hopping between sites. Scores and statuses are shown exactly as the
          upstream providers report them — a match is only marked live or finished when the source says so.
        </p>
      </section>
      <section>
        <h2>Where the data comes from</h2>
        <p>
          Live fixtures, scores, statistics and tables come from public sports-data providers. Highlights play inside
          the official YouTube player and link back to YouTube. Streams listed on the site are aggregated from
          third-party networks; Limon Live does not host broadcast feeds on its own servers.
        </p>
      </section>
      <section>
        <h2>Honest screens</h2>
        <p>
          When a source has not published something — a lineup, a score, a result — the site says so instead of
          guessing. Placeholder data is never presented as fact.
        </p>
      </section>
      <section>
        <h2>Working with us</h2>
        <p>
          Advertisers can reach us through the <a href="/advertise">Advertise</a> desk. Data and API enquiries are
          covered on the <a href="/api-partnerships">API Partnerships</a> page. For everything else, see{' '}
          <a href="/contact">Contact</a>.
        </p>
      </section>
    </LegalPage>
  );
}
