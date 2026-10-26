import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { accountTypeFromUserMetadata, resolvePostAuthPath } from '@/lib/universe';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * OAuth / magic-link handshake.
 *
 * Two things this route decides that it used to get wrong:
 *
 *   1. **which universe** the account belongs to. It redirected to `/dashboard`
 *      unconditionally, so an organisation completing signup landed on the
 *      talent feed and only reached `/org/dashboard` after the middleware
 *      bounced it back out — a visible flash of the wrong product. The profile
 *      row is read here, with `user_metadata.account_type` (written by signup)
 *      as the fallback when the row does not exist yet.
 *   2. **where a crafted `?next=` may go**. `resolvePostAuthPath` rejects
 *      protocol-relative targets (`//evil.example`, `/\evil.example`) *and*
 *      any path outside the account's own universe.
 *
 * The origin is always ours: `x-forwarded-host` is client-influenced and must
 * never decide where a user lands.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let accountType: string | null = null;
      let onboardingCompleted: boolean | null = null;

      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('account_type, onboarding_completed')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          accountType = profile.account_type;
          onboardingCompleted = Boolean(profile.onboarding_completed);
        } else {
          accountType = accountTypeFromUserMetadata(user.user_metadata);
        }
      }

      const target = resolvePostAuthPath({ next, accountType, onboardingCompleted });
      return NextResponse.redirect(`${origin}${target}`, { headers: NO_STORE });
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_code_error`, { headers: NO_STORE });
}
