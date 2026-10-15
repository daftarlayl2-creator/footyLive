import ProfileDashboard from '@/components/profile/ProfileDashboard';

export const metadata = {
  title: 'Your fan profile — EVIV Live',
  description: 'Sign in to EVIV Live, edit your display name, avatar and favourite club, and track your prediction accuracy and chat activity.',
};

export default async function ProfilePage({ searchParams }) {
  const params = await searchParams;
  const authReturn = typeof params?.auth === 'string' ? params.auth : null;
  const reason = typeof params?.reason === 'string' ? params.reason : 'invalid';
  return <ProfileDashboard authReturn={authReturn} authReason={reason} />;
}
