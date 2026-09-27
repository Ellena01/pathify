import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { homeFor, isOrgRoute, universeOf } from '@/lib/universe';

/**
 * Routes reachable without a session.
 * Everything else requires authentication and is redirected to /login.
 *
 * `/onboarding` is deliberately NOT here: it reads the profile, writes to it
 * and issues a passport, so an anonymous visitor has nothing to see — the
 * server sends them to /login (with `next=` preserved) instead of letting a
 * client-side effect do it after first paint.
 */
const PUBLIC_PATHS = new Set(['/', '/login', '/signup', '/org']);

/** Prefixes reachable without a session (public share pages, auth handshake, APIs). */
const PUBLIC_PREFIXES = ['/p/', '/auth/', '/api/'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Two separate universes, enforced here rather than in a client `useEffect`.
 *
 * The gate answers three questions per request, in this order:
 *
 *   1. is this account signed in?
 *   2. which universe does it belong to (`user_profiles.account_type`)?
 *   3. has it finished onboarding (`user_profiles.onboarding_completed`)?
 *
 * Doing it in a `useEffect` is what previously let protected UI flash before
 * bouncing. Doing it per-universe is what keeps an organisation account out of
 * `/dashboard` and a talent account out of `/org/talent` — both were reachable
 * by typing the URL.
 *
 * A failed profile read degrades to "no gate" rather than "no access": on an
 * unmigrated database the column does not exist, and locking every signed-in
 * user out of the app would turn a missing migration into an outage.
 */
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

  // Signed in. Public prefixes (share pages, OAuth handshake, APIs) do their
  // own authorisation and must never be bounced into a universe.
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return supabaseResponse;
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('account_type, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    // Migration not applied (or a transient failure). Serve the page rather
    // than trapping the account behind a gate that can never open.
    return supabaseResponse;
  }

  const universe = universeOf(profile?.account_type);
  const home = homeFor(universe);
  const onboarded = Boolean(profile?.onboarding_completed);

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    return NextResponse.redirect(url);
  };

  // Authenticated visitors of the marketing surfaces land in their own product.
  if (pathname === '/') return redirectTo(home);
  if (pathname === '/login' || pathname === '/signup') return redirectTo(home);

  // `/onboarding` serves both universes — the page branches on account type.
  // Finishing it sends the account to its own home, not to a fixed path.
  if (pathname === '/onboarding') {
    return onboarded ? redirectTo(home) : supabaseResponse;
  }

  if (isOrgRoute(pathname)) {
    // A talent account has no business in the organisation space...
    if (universe !== 'org') return redirectTo(homeFor('individual'));
    // ...and an organisation account sees the public page only as a stranger:
    // signed in, it goes straight to its dashboard.
    if (pathname === '/org') return redirectTo(homeFor('org'));
    if (!onboarded) return redirectTo('/onboarding');
    return supabaseResponse;
  }

  // Talent space.
  if (universe !== 'individual') return redirectTo(homeFor('org'));
  if (!onboarded) return redirectTo('/onboarding');

  return supabaseResponse;
}

