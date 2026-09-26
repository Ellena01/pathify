import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { PathifyDatabase } from './admin';

/**
 * Request-scoped Supabase client, authenticated as the signed-in user.
 *
 * The explicit `<PathifyDatabase>` generic is load-bearing. Without it,
 * supabase-js 2.117 infers `Database = unknown` at this call site, which
 * collapses the per-table `Schema` generic to `never` — so `.select('title')`
 * on `opportunities_cache` resolves the row to `GenericStringError` and every
 * property access on the result fails to typecheck.
 *
 * `PathifyDatabase` declares the tables as an open record, so query builders
 * stay fully typed while row *contents* stay loose. The schema is enforced by
 * Postgres; these types only have not to get in the way until `supabase gen
 * types` output replaces them. See `./admin` for the full rationale.
 *
 * Server-only. Never import this into a client component — use
 * `./client`, which holds the anon key and relies on RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<PathifyDatabase>(
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
