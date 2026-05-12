import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js middleware for auth protection.
 * - Refreshes the Supabase auth session on every request (keeps tokens fresh)
 * - Redirects unauthenticated users to /login for protected routes
 * - Allows public routes (login, signup, auth callback) without auth
 */

const PUBLIC_ROUTES = ['/login', '/signup', '/auth/callback'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function isDemoSession(request: NextRequest): boolean {
  return request.cookies.get('sitecheck_demo')?.value === '1';
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — this keeps the auth token alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow public routes without auth
  if (isPublicRoute(pathname)) {
    // If user is already logged in and visits /login, redirect to dashboard
    if (user && (pathname === '/login' || pathname === '/signup')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // For API routes, return 401 JSON instead of redirect
  if (isApiRoute(pathname)) {
    // Allow admin migration endpoint with its own token auth
    if (pathname.startsWith('/api/admin/')) {
      return supabaseResponse;
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return supabaseResponse;
  }

  // For page routes, redirect to login if unauthenticated
  // Allow demo sessions through without a Supabase user (cookie-only signal).
  if (!user && !isDemoSession(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public assets (images, fonts, demo photos)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|demo-photos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)).*)',
  ],
};
