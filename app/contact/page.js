import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Contact — Limon Live',
  description: 'How to reach Limon Live: advertising, partnerships, copyright and account questions.',
  alternates: { canonical: '/contact' },
};

/* Owner: add the official support e-mail (and postal address if required by
   local law) here and remove this comment. No address is invented on this
   page; every channel below already works inside the product. */
export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      intro="Pick the channel that matches your question — these are the routes the team actively monitors."
    >
      <section>
        <h2>Advertising &amp; sponsorship</h2>
        <p>
          Use the <a href="/advertise">advertiser desk</a>: tell us about your brand and the placements you are
          interested in, and the partnerships team will reply with availability and next steps.
        </p>
      </section>
      <section>
        <h2>API &amp; data partnerships</h2>
        <p>
          Start on the <a href="/api-partnerships">API Partnerships</a> page, which explains what is available and how
          to open a conversation.
        </p>
      </section>
      <section>
        <h2>Copyright &amp; takedown</h2>
        <p>
          Rights holders can follow the process on the <a href="/copyright">Copyright / DMCA</a> page. Complete notices
          are acted on promptly.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          Signed-in fans receive receipts and platform notices in the in-app <a href="/inbox">message centre</a>, and
          can manage their details from the <a href="/profile">profile</a> page.
        </p>
      </section>
      <section>
        <h2>Response times</h2>
        <p>
          We read everything, but we are a small team: advertising and copyright messages are usually answered first.
          Please include links (not screenshots) when reporting a problem with a specific page or match.
        </p>
      </section>
    </LegalPage>
  );
}
