import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  validateAdminCredentials,
  verifyAdminSessionToken,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = verifyAdminSessionToken(token);
  return NextResponse.json(
    { authenticated },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body ?? {};

    if (!validateAdminCredentials(username, password)) {
      return NextResponse.json(
        { authenticated: false, error: 'Invalid username or password' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const token = createAdminSessionToken();
    const response = NextResponse.json(
      { authenticated: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch {
    return NextResponse.json(
      { authenticated: false, error: 'Unable to process login request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
