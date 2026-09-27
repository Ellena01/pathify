'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, Sparkles, Shield, Loader2, Check } from 'lucide-react';
import { useUserStore } from '@/app/store';
import { useUiStore } from '@/lib/ui-store';
import { useSidebar } from './SidebarContext';

export function MobileHeader() {
  const user = useUserStore();
  const { openSidebar } = useSidebar();
  const autosaveStatus = useUiStore((s) => s.autosaveStatus);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/[0.08] bg-zinc-950/85 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile hamburger & title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={openSidebar}
          aria-label="Open navigation drawer"
          className="lg:hidden p-2 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-black tracking-tight bg-gradient-to-r from-white to-[#8B5CF6] bg-clip-text text-transparent truncate">
            PATHIFY
          </span>
        </div>
      </div>

      {/* Right: Autosave status indicator + Quick Actions + User Passport Chip */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Autosave subtle pill */}
        {autosaveStatus !== 'idle' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all">
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 text-[#A78BFA] animate-spin" />
                <span className="text-[#A78BFA] hidden sm:inline">Saving…</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-[#10B981]" />
                <span className="text-[#10B981] hidden sm:inline">Saved</span>
              </>
            )}
            {autosaveStatus === 'error' && (
              <span className="text-rose-400">Save failed</span>
            )}
          </div>
        )}

        {/* AI Navigator quick access button */}
        <Link
          href="/navigator"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 text-[#A78BFA] border border-[#8B5CF6]/30 shadow-[0_0_12px_rgba(139,92,246,0.15)] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
          <span className="hidden sm:inline">Ask Navigator</span>
          <span className="sm:hidden font-mono text-[10px]">AI</span>
        </Link>

        {/* Passport profile indicator */}
        <Link
          href="/passport"
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs transition-colors"
        >
          <div className="w-5 h-5 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center text-[#A78BFA]">
            <Shield className="w-3 h-3" />
          </div>
          <span className="font-mono text-[#F5F5F7] hidden md:inline">
            {user.passport_id || 'Talent Passport'}
          </span>
        </Link>
      </div>
    </header>
  );
}
