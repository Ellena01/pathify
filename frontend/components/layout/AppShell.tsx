'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileNavigation } from './MobileNavigation';
import { MainCanvas } from './MainCanvas';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from '@/lib/navigation';

/**
 * The unified application shell.
 *
 * Rendered once by `app/(app)/layout.tsx` rather than imported by every page,
 * which is how the layout had drifted between routes.
 *
 * Authentication and the onboarding gate are enforced in
 * `utils/supabase/middleware.ts`. This component deliberately does NOT redirect:
 * duplicating the check in a `useEffect` was what caused protected UI to flash
 * before bouncing an anonymous visitor.
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
  const { isSidebarOpen, closeSidebar, isSidebarCollapsed } = useSidebar();

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
            'id, name, role, country, skills, goals, passport_id, passport_share_slug, is_passport_public, passport_issued_at, onboarding_completed, metadata, jurisdiction, is_admin'
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
    <div className="min-h-screen bg-[#080414] text-[#F5F5F7] relative selection:bg-[#8B5CF6]/30">
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
          className={`fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-[#080414] shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out border-r border-white/[0.08] ${
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
