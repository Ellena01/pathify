import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Routes reachable without a session.
 * Everything else requires authentication and is redirected to /login.
 */
const PUBLIC_PATHS = new Set(['/', '/login', '/signup', '/onboarding', '/org']);

/** Prefixes reachable without a session (public share pages, auth handshake, APIs). */
const PUBLIC_PREFIXES = ['/p/', '/auth/', '/api/'];

/** Authenticated routes that a user must finish onboarding before seeing. */
const POST_ONBOARDING_PATHS = new Set(['/dashboard', '/passport', '/tracker', '/pathways', '/settings']);

const DEFAULT_REDIRECT = '/dashboard';

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: no logic may run between createServerClient and getUser(),
  // otherwise the refreshed session cookie can be dropped.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse;

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Preserve where they were headed so login can bounce them back.
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Authenticated: bounce login/signup back into the app.
  if (pathname === '/login' || pathname === '/signup') {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_REDIRECT;
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Onboarding gate — enforced here, server-side, so protected content never
  // flashes before a client-side useEffect redirect fires.
  if (POST_ONBOARDING_PATHS.has(pathname)) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && !profile.onboarding_completed) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
