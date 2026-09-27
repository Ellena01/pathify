import { AppShell } from '@/components/layout/AppShell';

/**
 * Organisation workspace route group.
 *
 * A route group does not affect the URL, so `/org/dashboard` resolves to
 * `app/org/(org)/dashboard/page.tsx`. It exists so the four signed-in
 * organisation pages mount the shell once — the same shell the talent universe
 * uses, which is deliberate: one nav implementation, one mobile drawer, one
 * breakpoint layout, with `navGroupsFor(account_type)` deciding what is drawn.
 *
 * `app/org/page.tsx` (the public marketing preview) is *not* inside this group,
 * so it never inherits the sidebar, the profile hydration or the universe guard.
 *
 * Access control lives in `utils/supabase/middleware.ts`: a talent account
 * reaching `/org/*` is replaced with `/dashboard` before rendering, and an
 * organisation account reaching a talent route is sent to `/org/dashboard`.
 */
export default function OrgWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
