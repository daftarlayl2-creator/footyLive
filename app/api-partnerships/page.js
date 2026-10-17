import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'API Partnerships — Limon Live',
  description: 'Data and API partnership enquiries for Limon Live: what exists today and how to talk to us.',
  alternates: { canonical: '/api-partnerships' },
};

/* Owner: confirm whether a public partner API will be offered, plus any terms,
   rate limits and pricing, before promising them here. This page only
   describes what exists today (the API hub explorer). */
export default function ApiPartnershipsPage() {
  return (
    <LegalPage
      title="API Partnerships"
      intro="Limon Live runs on documented, structured football data — fixtures, live status, scores, events and tables normalised into one canonical model. This page explains how partnership conversations start."
    >
      <section>
        <h2>Explore what exists</h2>
        <p>
          The <a href="/api-hub">API hub</a> shows the shapes our own product consumes, so you can evaluate fit before
          writing to us. Public self-serve keys are not offered at this time.
        </p>
      </section>
      <section>
        <h2>Good-fit partnerships</h2>
        <ul>
          <li>Data providers who want distribution with strict status/score integrity rules.</li>
          <li>Publishers and apps needing fixture/result widgets with honest empty states.</li>
          <li>Rights-cleared stream or highlights partners (we never bypass regional or paywall restrictions).</li>
        </ul>
      </section>
      <section>
        <h2>Ground rules</h2>
        <ul>
          <li>Upstream licences always win: nothing is republished beyond what the source permits.</li>
          <li>Verified data is never mixed with community submissions.</li>
          <li>Any integration must keep working — and say so — when a source is unavailable.</li>
        </ul>
      </section>
      <section>
        <h2>Start a conversation</h2>
        <p>
          Reach out through the <a href="/advertise">advertiser &amp; partnerships desk</a> with your use case, expected
          volume, and territories. We reply with current options — no invented SLAs.
        </p>
      </section>
    </LegalPage>
  );
}
