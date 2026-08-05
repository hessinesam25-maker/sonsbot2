import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/db/supabase-ssr';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const { supabase, response } = createMiddlewareSupabaseClient(req);

  // Refresh auth session
  const { data: { user } } = await supabase.auth.getUser();

  const isDashboardRoute = pathname.startsWith('/dashboard');
  const isProtectedApiRoute = pathname.startsWith('/api/auth/instagram') || pathname.startsWith('/api/admin');

  if (!user) {
    if (isDashboardRoute) {
      const loginUrl = new URL('/login', req.url);
      return NextResponse.redirect(loginUrl);
    }
    if (isProtectedApiRoute) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid server-side session required.' },
        { status: 401 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/auth/instagram/:path*',
    '/api/admin/:path*',
  ],
};
