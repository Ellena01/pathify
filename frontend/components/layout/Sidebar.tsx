'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Layers,
  Sparkles,
  Shield,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  CheckSquare,
  Globe,
  Award
} from 'lucide-react';
import { useUserStore } from '@/app/store';
import { createClient } from '@/utils/supabase/client';
import { calculateProfileCompleteness } from '@/app/types/passport';
import { useSidebar } from './SidebarContext';
import { NavGroup } from '../navigation/NavGroup';
import { NavItemConfig } from '../navigation/NavItem';
import { NavTooltip } from '../navigation/NavTooltip';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const router = useRouter();
  const supabase = createClient();
  const user = useUserStore();
  const { isSidebarCollapsed, toggleCollapse } = useSidebar();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    user.reset();
    router.push('/login');
    router.refresh();
  };

  const completeness = calculateProfileCompleteness(user);

  // Group 1: Overview
  const OVERVIEW_ITEMS: NavItemConfig[] = [
    { href: '/dashboard', label: 'Dashboard', icon: Layers },
  ];

  // Group 2: Intelligence & Discovery
  const DISCOVERY_ITEMS: NavItemConfig[] = [
    { href: '/opportunities', label: 'Opportunities', icon: Compass },
    { href: '/navigator', label: 'AI Navigator', icon: Sparkles, badge: 'AI' },
  ];

  // Group 3: Career & Identity
  const CAREER_ITEMS: NavItemConfig[] = [
    { href: '/passport', label: 'Talent Passport', icon: Shield },
  ];

  // Group 4: Account & Preferences
  const ACCOUNT_ITEMS: NavItemConfig[] = [
    { href: '/settings', label: 'Settings & Profile', icon: Settings },
  ];

  return (
    <aside
      className={`h-full bg-[#080414] border-r border-white/[0.08] flex flex-col justify-between shrink-0 select-none transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? 'w-20' : 'w-[272px]'
      }`}
    >
      {/* Brand Header & Collapse Toggle */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.08]">
          <Link
            href="/"
            onClick={onCloseMobile}
            className={`flex items-center gap-3 group overflow-hidden ${
              isSidebarCollapsed ? 'mx-auto' : ''
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] flex items-center justify-center text-white shadow-[0_0_16px_rgba(139,92,246,0.35)] group-hover:scale-105 transition-transform shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                <circle cx="6" cy="18" r="2" />
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="12" r="2" />
                <path d="M8 17.5L16 13" />
                <path d="M8 6.5L16 11" />
              </svg>
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <span className="text-[17px] font-black tracking-tight bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent block leading-tight">
                  PATHIFY
                </span>
                <span className="text-[9px] uppercase tracking-widest text-[#8B8B96] block leading-none truncate">
                  Talent Intelligence
                </span>
              </div>
            )}
          </Link>

          {/* Desktop collapse toggle button */}
          {!onCloseMobile && (
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex p-1.5 rounded-lg text-[#8B8B96] hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <nav
          aria-label="Main Navigation"
          className={`p-3 space-y-3 overflow-y-auto no-scrollbar ${
            isSidebarCollapsed ? 'px-2' : ''
          }`}
        >
          <NavGroup
            label="Overview"
            items={OVERVIEW_ITEMS}
            isCollapsed={isSidebarCollapsed}
            onItemClick={onCloseMobile}
          />

          <NavGroup
            label="Discover"
            items={DISCOVERY_ITEMS}
            isCollapsed={isSidebarCollapsed}
            onItemClick={onCloseMobile}
          />

          <NavGroup
            label="Career"
            items={CAREER_ITEMS}
            isCollapsed={isSidebarCollapsed}
            onItemClick={onCloseMobile}
          />

          <NavGroup
            label="Account"
            items={ACCOUNT_ITEMS}
            isCollapsed={isSidebarCollapsed}
            onItemClick={onCloseMobile}
          />
        </nav>
      </div>

      {/* Footer / Passport Card / User Profile */}
      <div className="p-3 border-t border-white/[0.08] space-y-3">
        {/* Passport summary pill */}
        {user.passport_id && (
          <div
            className={`p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all ${
              isSidebarCollapsed ? 'text-center' : 'space-y-2'
            }`}
          >
            {isSidebarCollapsed ? (
              <NavTooltip content={`Passport: ${completeness}% complete`} side="right">
                <Link
                  href="/passport"
                  onClick={onCloseMobile}
                  className="flex flex-col items-center gap-1 group py-1"
                >
                  <Shield className="w-4 h-4 text-[#10B981] group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-mono text-[#A78BFA] font-bold">
                    {completeness}%
                  </span>
                </Link>
              </NavTooltip>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#8B8B96] uppercase tracking-wider font-semibold flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-[#10B981]" /> Passport
                  </span>
                  <span className="text-[#A78BFA] font-mono font-bold">
                    {completeness}% complete
                  </span>
                </div>
                <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#10B981] rounded-full transition-all duration-500"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono text-[#A1A1AA] truncate">
                  {user.passport_id}
                </p>
              </>
            )}
          </div>
        )}

        {/* User Card & Sign Out */}
        <div
          className={`flex items-center pt-1 ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-2'
          }`}
        >
          {!isSidebarCollapsed && (
            <div className="min-w-0 flex-1 mr-2">
              <p className="text-xs font-semibold text-[#F5F5F7] truncate">
                {user.name || 'Pathify User'}
              </p>
              <p className="text-[11px] text-[#8B8B96] truncate">
                {user.country || 'Global'}
              </p>
            </div>
          )}

          {isSidebarCollapsed ? (
            <NavTooltip content="Sign out" side="right">
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-[#8B8B96] hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </NavTooltip>
          ) : (
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="p-2 rounded-lg text-[#8B8B96] hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
