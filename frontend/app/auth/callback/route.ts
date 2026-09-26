import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * Sanitise a post-auth redirect target.
 *
 * Only same-origin, single-slash-prefixed paths are allowed. Rejecting `//`
 * and `/\` blocks the protocol-relative bypass (`/\evil.com` normalises to
 * `//evil.com` in most URL parsers), which would otherwise let a crafted
 * `?next=` bounce a freshly-authenticated user off-site.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  // Reject control characters and anything that could re-parse as a new URL.
  if (/[\u0000-\u001F\u007F]/.test(raw)) return '/dashboard';
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Called from a Server Component context; middleware refreshes.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Redirect strictly against our own origin. `x-forwarded-host` is
      // client-influenced and must never decide where a user lands.
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_code_error`, { headers: NO_STORE });
}
