'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileNavigation } from './MobileNavigation';
import { MainCanvas } from './MainCanvas';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import { AutosaveStatus } from '@/app/hooks/useAutosave';
import { X } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  autosaveStatus?: AutosaveStatus;
  requireAuth?: boolean;
}

function AppShellContent({
  children,
  title,
  subtitle,
  autosaveStatus,
  requireAuth = true,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { hydrate, isHydrated } = useUserStore();
  const { isSidebarOpen, closeSidebar, isSidebarCollapsed } = useSidebar();

  // Close mobile drawer automatically upon client route changes
  useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (requireAuth) {
            router.push('/login');
          }
          return;
        }

        // Fetch user profile from Supabase
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          hydrate({
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
          });

          // Check if onboarding is needed (only if incomplete and not already on /onboarding)
          if (!profile.onboarding_completed && window.location.pathname !== '/onboarding') {
            router.push('/onboarding');
          }
        }
      } catch (err) {
        console.warn('Session init error:', err);
      }
    };

    if (!isHydrated) {
      initSession();
    }
  }, [supabase, hydrate, isHydrated, requireAuth, router]);

  return (
    <div className="min-h-screen bg-[#080414] text-[#F5F5F7] flex flex-col lg:flex-row relative selection:bg-[#8B5CF6]/30">
      {/* Desktop Persistent Sidebar */}
      <div
        className={`hidden lg:block h-screen fixed top-0 left-0 z-30 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <Sidebar />
      </div>

      {/* Mobile Drawer Overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          isSidebarOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
          aria-hidden="true"
        />

        {/* Drawer panel */}
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

      {/* Main Canvas & Content Area */}
      <MainCanvas>
        <MobileHeader
          title={title}
          subtitle={subtitle}
          autosaveStatus={autosaveStatus}
        />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </MainCanvas>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation />
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellContent {...props} />
    </SidebarProvider>
  );
}
