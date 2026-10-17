/**
 * GET /api/iptv/catalog
 *
 * The dynamic IPTV catalogue parsed server-side from the verified playlist
 * repository (`daftarlayl2-creator/iptv`). Raw stream URLs are never
 * exposed — entries link to `/iptv/[id]`, which resolves a signed proxy
 * URL server-side. Hidden (empty + `disabled:true`) while Live TV is off.
 */
import { NextResponse } from 'next/server';
import { isLiveTvEnabled } from '@/lib/config/features';
import { getIptvCatalog, toPublicChannel } from '@/lib/iptv/catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isLiveTvEnabled()) {
    return NextResponse.json(
      { disabled: true, channels: [], categories: [], regions: [], sources: [], generatedAt: null, stale: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const catalog = await getIptvCatalog();
  return NextResponse.json(
    {
      disabled: false,
      channels: catalog.channels.map(toPublicChannel),
      categories: catalog.categories,
      regions: catalog.regions,
      sources: catalog.sources,
      generatedAt: catalog.generatedAt,
      stale: catalog.stale,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
