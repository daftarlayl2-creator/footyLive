import LegalPage from '@/components/legal/LegalPage';

export const metadata = {
  title: 'Copyright / DMCA — Limon Live',
  description: 'How rights holders can request removal of infringing material from Limon Live.',
  alternates: { canonical: '/copyright' },
};

/* Owner: publish the designated copyright agent's e-mail here (and register it
   where required, e.g. with the US Copyright Office for DMCA §512) — no agent
   details are invented on this page. */
export default function CopyrightPage() {
  return (
    <LegalPage
      title="Copyright / DMCA"
      intro="Limon Live respects intellectual-property rights. Streams and videos shown or linked here come from third-party providers; if your protected work appears here without authorisation, we will act on a complete notice."
    >
      <section>
        <h2>What to include in a notice</h2>
        <ul>
          <li>Identification of the copyrighted work (or a representative list).</li>
          <li>The exact URL(s) on Limon Live where the material appears.</li>
          <li>Your name, organisation, and contact details for follow-up.</li>
          <li>A good-faith statement that the use is not authorised by the owner, its agent, or the law.</li>
          <li>A statement, under penalty of perjury where applicable, that the information is accurate and that you are authorised to act for the owner.</li>
          <li>Your physical or electronic signature.</li>
        </ul>
      </section>
      <section>
        <h2>How to send it</h2>
        <p>
          Send notices via the <a href="/contact">Contact</a> page marked “Copyright”. Complete notices are prioritised;
          incomplete ones may be returned for the missing details above.
        </p>
      </section>
      <section>
        <h2>What happens next</h2>
        <p>
          Valid notices result in the material (or link) being removed or disabled promptly. Where content was
          submitted by a user, repeat infringers lose submission and account privileges. If your content was removed
          in error, you may send a counter-notice with the details needed to evaluate restoration under applicable law.
        </p>
      </section>
      <section>
        <h2>Third-party hosts</h2>
        <p>
          For material hosted by a third party (for example YouTube embeds), notifying that host as well ensures the
          source itself is addressed everywhere it appears.
        </p>
      </section>
    </LegalPage>
  );
}
