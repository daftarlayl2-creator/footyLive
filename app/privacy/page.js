import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Privacy Policy — Limon Live',
  description: 'What Limon Live stores in your browser, on your account, and what third parties may collect.',
  alternates: { canonical: '/privacy' },
};

/* Owner/legal: confirm retention periods, the analytics description, and the
   named processors against the production configuration, then set a real
   effective date. This text describes the implementation as built. */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This page describes what data Limon Live handles and why. It reflects how the site is actually built; where a third party collects data, we say so."
    >
      <section>
        <h2>Stored on your device</h2>
        <ul>
          <li>Preferences such as theme, favourite teams, and sound settings (browser local storage).</li>
          <li>A chat nickname, and — when the live backend is unavailable — chat saved only in your browser.</li>
          <li>Favourite channels and similar bookmarks. Clearing site data removes all of these.</li>
        </ul>
      </section>
      <section>
        <h2>Accounts</h2>
        <p>
          If you register, we store the account details you provide (such as your display name and e-mail) and your
          activity within the product (for example chat attribution and purchases). Account data is processed through
          our authentication/database provider under its security controls.
        </p>
      </section>
      <section>
        <h2>First-party analytics</h2>
        <p>
          The site sends a lightweight first-party beacon counting page views and ad-slot impressions/clicks. It is
          used to operate the service and report aggregate numbers to advertisers; it is not sold.
        </p>
      </section>
      <section>
        <h2>Third parties</h2>
        <ul>
          <li>
            Advertising networks serving banners may set their own cookies and collect device/usage data under their
            own policies.
          </li>
          <li>Embedded YouTube players are run by YouTube/Google under their policies.</li>
          <li>Third-party stream and channel pages you open are operated by their respective providers.</li>
        </ul>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          You can browse without an account, clear locally stored data at any time from your browser, and ask for your
          account data to be corrected or deleted via the <a href="/contact">Contact</a> page.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>When this policy changes materially, the date at the top of this page will change with it.</p>
      </section>
    </LegalPage>
  );
}
