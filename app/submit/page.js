import LegalPage from '@/components/legal/LegalPage';
import SubmissionForm from '@/components/community/SubmissionForm';

export const metadata = {
  title: 'Submit a match or source — Limon Live',
  description: 'Suggest a missing fixture or a rights-cleared source. Every submission is moderated before anything changes.',
  alternates: { canonical: '/submit' },
};

export default function SubmitPage() {
  return (
    <LegalPage
      title="Submit a match or source"
      intro="Missing a fixture, or know an official, rights-cleared source we should list? Tell the moderators below. Submissions never change live scores or listings by themselves — a moderator verifies every one against an official source first."
    >
      <SubmissionForm />
      <section>
        <h2>Please don&rsquo;t submit</h2>
        <ul>
          <li>Score “corrections” — scores come from the upstream providers only.</li>
          <li>Links you do not have the right to share, or ways around a paywall/region lock.</li>
          <li>Anything unlawful; repeat abuse loses submission privileges.</li>
        </ul>
      </section>
    </LegalPage>
  );
}
