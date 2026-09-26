'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, Sparkles, Shield, User, Loader2, Check } from 'lucide-react';
import { useUserStore } from '@/app/store';
import { AutosaveStatus } from '@/app/hooks/useAutosave';

interface AppHeaderProps {
  onOpenMobile?: () => void;
  title?: string;
  subtitle?: string;
  autosaveStatus?: AutosaveStatus;
}

export function AppHeader({
  onOpenMobile,
  title,
  subtitle,
  autosaveStatus,
}: AppHeaderProps) {
  const user = useUserStore();

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/[0.08] bg-[#080414]/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile hamburger & title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {title ? (
          <div>
            <h1 className="text-base font-bold text-[#F5F5F7] tracking-tight leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-[#8B8B96] mt-0.5 leading-none">{subtitle}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-sm font-black tracking-tight bg-gradient-to-r from-white to-[#8B5CF6] bg-clip-text text-transparent">
              PATHIFY
            </span>
          </div>
        )}
      </div>

      {/* Right: Autosave status indicator + Quick Actions + User Passport Chip */}
      <div className="flex items-center gap-3">
        {/* Autosave subtle pill */}
        {autosaveStatus && autosaveStatus !== 'idle' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all">
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 text-[#A78BFA] animate-spin" />
                <span className="text-[#A78BFA]">Saving…</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-[#10B981]" />
                <span className="text-[#10B981]">Saved</span>
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
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 text-[#A78BFA] border border-[#8B5CF6]/30 shadow-[0_0_12px_rgba(139,92,246,0.15)] transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Ask Navigator</span>
        </Link>

        {/* Passport profile indicator */}
        <Link
          href="/passport"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs transition-colors"
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
