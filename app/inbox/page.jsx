import MessageCenter from '@/components/inbox/MessageCenter';

export const metadata = {
  title: 'Inbox · صندوق الرسائل — Limon Live',
  description:
    'Your Limon Live message centre: Rewards Store receipts, coin movements, VIP access grants, moderation notices and platform broadcasts — each styled by the team that sent it.',
  robots: { index: false, follow: true },
};

/**
 * /inbox — the dedicated message centre.
 *
 * The header tray is the quick look; this is the full archive, with sender
 * filters (إدارة الموقع / الأدمين / الدعم الفني), the receipt detail (coins
 * spent, new balance, validity) and the support desk that opens a ticket.
 */
export default function InboxPage() {
  return (
    <div className="w-full" data-inbox-route="">
      <MessageCenter />
    </div>
  );
}
