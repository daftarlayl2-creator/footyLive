import SpinHub from '@/components/spin/SpinHub';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Daily Lemon Wheel — free coins & VIP passes | Limon Live',
  description:
    'Spin the Daily Lemon Wheel once every 24 hours and win 100 to 5,000 Limon Coins or a 24-hour VIP pass with ad-free FHD streams and Multi-View.',
  alternates: { canonical: '/spin' },
};

/**
 * /spin — the Daily Lemon Wheel.
 *
 * Registered fans spin once every 24 hours. The prize draw and the cooldown
 * are enforced on the server (`/api/spin`); the page only animates the wheel
 * and shows the winnings.
 */
export default function SpinPage() {
  return (
    <div className="w-full">
      <SpinHub />
    </div>
  );
}
