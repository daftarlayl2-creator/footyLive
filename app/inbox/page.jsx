import MessageCenter from '@/components/inbox/MessageCenter';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata = {
  title: 'Inbox · صندوق الرسائل — Limon Live',
  description:
    'Your Limon Live message centre: Rewards Store receipts, coin movements, VIP access grants, moderation notices and platform broadcasts — each styled by the team that sent it.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/inbox' },
};

/**
 * /inbox — the dedicated message centre.
 *
 * The header tray is the quick look; this is the full archive, with sender
 * filters (إدارة الموقع / الأدمين / الدعم الفني), the receipt detail (coins
 * spent, new balance, validity) and the support desk that opens a ticket.
 * The centre sits inside its own error boundary so a messaging outage never
 * takes down the surrounding shell.
 */
export default function InboxPage() {
  return (
    <div className="w-full" data-inbox-route="">
      <ErrorBoundary name="inbox" title="Inbox hit a snag" message="Your messages could not be loaded right now. Nothing was lost — try opening the message centre again.">
        <MessageCenter />
      </ErrorBoundary>
    </div>
  );
}
