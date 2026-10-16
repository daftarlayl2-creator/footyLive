/**
 * GET /api/admin/overview — the /mounadel command-center snapshot.
 *
 * Live visitors, ad impressions/clicks with CTR, the 14-day series and user /
 * finance rollups. Requires the signed admin session cookie.
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin/guard';
import { metricsSnapshot } from '@/lib/admin/metrics';
import { listAdminUsers } from '@/lib/admin/users';
import { ledgerSnapshot } from '@/lib/admin/ledger';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET(request: Request) {
  const gate = requirePermission(request, 'dashboard.view');
  if (!gate.ok) return gate.response;
  const [metrics, users, ledger] = await Promise.all([metricsSnapshot(), listAdminUsers(), ledgerSnapshot()]);
  return NextResponse.json(
    {
      metrics,
      users: {
        total: users.length,
        banned: users.filter((row) => row.banned).length,
      },
      finance: ledger.totals,
      at: Date.now(),
    },
    { headers },
  );
}
