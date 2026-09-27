'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileNavigation } from './MobileNavigation';
import { MainCanvas } from './MainCanvas';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import { homeFor, universeOf, universeOfRoute } from '@/lib/universe';
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from '@/lib/navigation';

/**
 * The unified application shell.
 *
 * Rendered once per universe by `app/(app)/layout.tsx` (talent) and by
 * `app/org/(org)/layout.tsx` (organisation), rather than imported by every
 * page, which is how the layout had drifted between routes. Both layouts get
 * identical chrome; the nav groups, home brand and footer differ by universe
 * through `navGroupsFor(account_type)`.
 *
 * Authentication and the onboarding gate are enforced in
 * `utils/supabase/middleware.ts`. The redirect below is not an access-control
 * check — middleware already performed one — it is a consistency guard for a
 * profile whose universe disagrees with the shell it is being drawn inside.
 *
 * Its only jobs are chrome (sidebar, mobile drawer, bottom bar) and hydrating
 * the client-side profile cache that the passport chip and completeness meter
 * read from.
 */

interface AppShellProps {
  children: React.ReactNode;
}

function AppShellContent({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSidebarOpen, closeSidebar, isSidebarCollapsed } = useSidebar();
  const accountType = useUserStore((s) => s.account_type);
  const isHydrated = useUserStore((s) => s.isHydrated);

  // Belt and braces on top of the middleware: if a hydrated profile lands in
  // the other universe's shell (stale session, failed redirect, a profile that
  // was switched server-side) it is sent back to its own home rather than being
  // shown someone else's app. The check is route-vs-account, not
  // "is this an org", because this shell renders both universes — the talent
  // shell under `app/(app)` and the organisation shell under `app/org/(org)`.
  useEffect(() => {
    if (!isHydrated) return;
    if (universeOfRoute(pathname) !== universeOf(accountType)) {
      router.replace(homeFor(accountType));
    }
  }, [isHydrated, accountType, pathname, router]);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  // Lock body scroll behind the open drawer.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isSidebarOpen]);

  // Hydrate the profile cache once per session. This is a cache fill, not an
  // access-control decision.
  useEffect(() => {
    let cancelled = false;

    async function hydrateProfile() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select(
            'id, name, role, country, skills, goals, passport_id, passport_share_slug, is_passport_public, passport_issued_at, onboarding_completed, metadata, jurisdiction, is_admin, account_type, org_name, org_website, org_focus, org_skills, org_geo'
          )
          .eq('id', user.id)
          .maybeSingle();

        if (!profile || cancelled) return;

        useUserStore.getState().hydrate({
          id: profile.id,
          name: profile.name || user.user_metadata?.name || '',
          role: profile.role || '',
          country: profile.country || user.user_metadata?.country || '',
          skills: profile.skills || [],
          goals: profile.goals || [],
          passport_id: profile.passport_id,
          passport_share_slug: profile.passport_share_slug,
          is_passport_public: profile.is_passport_public,
          passport_issued_at: profile.passport_issued_at,
          onboarding_completed: Boolean(profile.onboarding_completed),
          metadata: profile.metadata || {},
          jurisdiction: profile.jurisdiction ?? null,
          isAdmin: Boolean(profile.is_admin),
          // Defaults to 'individual' when the column is absent, so an
          // unmigrated database keeps rendering the talent surface.
          account_type: profile.account_type ?? 'individual',
          org_name: profile.org_name ?? null,
          org_website: profile.org_website ?? null,
          org_focus: profile.org_focus ?? [],
          org_skills: profile.org_skills ?? [],
          org_geo: profile.org_geo ?? [],
        });
      } catch {
        // A failed cache fill must never block rendering. The server-rendered
        // surfaces remain authoritative.
      }
    }

    hydrateProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative selection:bg-violet-500/30">
      {/* Desktop sidebar.
          Width here MUST match the <aside> in Sidebar.tsx and the margin in
          MainCanvas.tsx. They previously disagreed (256 / 272 / 256), so the
          sidebar's background and border painted 16px over the content. */}
      <div
        className={`hidden lg:block fixed top-0 left-0 h-screen z-30 transition-all duration-300 ease-in-out overflow-hidden ${
          isSidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
        }`}
      >
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
          className={`fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-zinc-950 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out border-r border-white/[0.08] ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={closeSidebar}
            aria-label="Close navigation drawer"
            className="absolute top-4 right-3 p-2 text-[#8B8B96] hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors z-20"
          >
            <X className="w-5 h-5" />
          </button>
          <Sidebar onCloseMobile={closeSidebar} />
        </div>
      </div>

      <MainCanvas>
        <MobileHeader />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-8">
          {children}
        </main>
      </MainCanvas>

      <MobileNavigation />
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  );
}
