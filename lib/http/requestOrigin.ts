/** Resolve the public origin behind the deployment's reverse proxy (including Arena previews). */
export function requestOrigin(request: Request): string {
  const fallback = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host'))?.split(',')[0].trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol : fallback.protocol.slice(0, -1);
  if (host) {
    try {
      const publicUrl = new URL(`${protocol}://${host}`);
      if (!publicUrl.username && !publicUrl.password && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash) return publicUrl.origin;
    } catch { /* malformed proxy metadata: use the request URL */ }
  }
  return fallback.origin;
}

export function isSameOriginRequest(request: Request, requireOrigin = false): boolean {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site' &&
    (origin ? origin === requestOrigin(request) : !requireOrigin);
}
