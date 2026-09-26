import { AppShell } from '@/components/layout/AppShell';

/**
 * Authenticated route group.
 *
 * A route group does not affect the URL, so `/dashboard` still resolves to
 * `app/(app)/dashboard/page.tsx`. Its only job is to mount the shell once.
 *
 * Previously every page imported and configured `<AppShell>` itself, which is
 * how the layout drifted between routes (and why a stray `requireAuth` flag on
 * `/opportunities` made a public page behave differently from its siblings).
 *
 * Access control lives in `utils/supabase/middleware.ts`, not here, so an
 * anonymous request never reaches this layout.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
