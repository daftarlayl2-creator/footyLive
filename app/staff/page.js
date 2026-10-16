import { headers } from 'next/headers';
import StaffPortal from '@/components/staff/StaffPortal';
import { isStaffHost, normalizeHost, roleForStaffHost } from '@/lib/admin/rbac';

export const metadata = {
  title: 'Staff Portal · Limon Live',
  description: 'Unified team sign-in for Limon Live league moderators and support managers.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/staff' },
};

export const dynamic = 'force-dynamic';

/**
 * /staff — the unified team portal.
 *
 * Reached directly (`/staff`) or through the `staff.eviv.si` sub-domain; the
 * Host header decides which desk the page greets (owner by default), and the
 * signed session decides what the portal actually renders. Staff pages are
 * `noindex` and never appear in the sitemap.
 */
export default async function StaffPage() {
  const headerList = await headers();
  const host = normalizeHost(headerList.get('host'));
  const staffHost = isStaffHost(host);
  const hostRole = roleForStaffHost(host);

  return (
    <div className="min-h-screen" data-staff-page="">
      <StaffPortal hostRole={hostRole} staffHost={staffHost} host={host} />
    </div>
  );
}
