import ProfileDashboard from '@/components/profile/ProfileDashboard';

export const metadata = {
  title: 'Your fan profile — EVIV Live',
  description: 'Sign in to EVIV Live, edit your display name, avatar and favourite club, and track your prediction accuracy and chat activity.',
};

export default function ProfilePage() {
  return <ProfileDashboard />;
}
