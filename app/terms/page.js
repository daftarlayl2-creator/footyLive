import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Terms of Service — Limon Live',
  description: 'The rules for using Limon Live: content sources, acceptable use, and liability limits.',
  alternates: { canonical: '/terms' },
};

/* Owner/legal: have counsel review — governing law, liability caps and the
   operator entity must be confirmed by the business before these terms are
   relied upon. */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="By using Limon Live you agree to these terms. If you do not agree, please do not use the service."
    >
      <section>
        <h2>The service</h2>
        <p>
          Limon Live aggregates football fixtures, scores, statistics, highlights and third-party streams. Live data
          is provided as reported by upstream sources; delays or inaccuracies in a source may appear on the site until
          the source corrects them.
        </p>
      </section>
      <section>
        <h2>Third-party content</h2>
        <p>
          Streams, channels, videos and advertisements remain the property and responsibility of their respective
          providers. Availability can change without notice, and some content may be restricted in your region by its
          provider. We do not circumvent those restrictions.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not scrape, bulk-download, or overload the service or its data endpoints.</li>
          <li>Do not post unlawful, abusive, infringing, or misleading content in chat or submissions.</li>
          <li>Do not attempt to access accounts, systems, or data that are not yours.</li>
          <li>Community submissions never alter verified scores or statuses.</li>
        </ul>
      </section>
      <section>
        <h2>Accounts &amp; purchases</h2>
        <p>
          You are responsible for activity under your account. Paid passes are described on the{' '}
          <a href="/pricing">pricing</a> page at the time of purchase; statutory consumer rights are unaffected.
        </p>
      </section>
      <section>
        <h2>Availability &amp; liability</h2>
        <p>
          The service is provided “as is” without warranties of uninterrupted availability or error-free data. To the
          extent permitted by law, liability for indirect or consequential loss is excluded.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update these terms; the date above reflects the current version. Continued use accepts the update.</p>
      </section>
    </LegalPage>
  );
}
