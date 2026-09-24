import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

  // IMPORTANT: Avoid writing any logic between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow auth routes and public assets (passport share + org demo are public)
  const publicPaths = ['/login', '/signup', '/auth', '/api/jobs', '/api/passport', '/p/', '/org', '/api/org', '/api/alerts/preview', '/api/navigator'];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic && request.nextUrl.pathname === '/') {
    // Optionally redirect to login — for now keep dashboard public but session-aware
    // Uncomment to enforce auth:
    // const url = request.nextUrl.clone();
    // url.pathname = '/login';
    // return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
