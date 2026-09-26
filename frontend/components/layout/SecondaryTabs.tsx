'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SecondaryTabItem {
  id: string;
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

interface SecondaryTabsProps {
  tabs: SecondaryTabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

export function SecondaryTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: SecondaryTabsProps) {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Secondary navigation tabs"
      className={`flex items-center gap-1 border-b border-white/[0.08] overflow-x-auto no-scrollbar py-1 ${className}`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab
          ? activeTab === tab.id
          : tab.href
          ? pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
          : false;

        const content = (
          <>
            {Icon && (
              <Icon
                className={`w-3.5 h-3.5 transition-colors ${
                  isActive ? 'text-[#A78BFA]' : 'text-[#8B8B96]'
                }`}
              />
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold leading-tight ${
                  isActive
                    ? 'bg-[#8B5CF6]/30 text-white border border-[#8B5CF6]/40'
                    : 'bg-white/[0.06] text-[#A1A1AA]'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </>
        );

        const tabStyles = `px-3.5 py-2 text-xs font-semibold rounded-lg shrink-0 flex items-center gap-2 transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] ${
          isActive
            ? 'text-white bg-white/[0.08] shadow-[0_2px_12px_rgba(139,92,246,0.15)] font-bold'
            : 'text-[#A1A1AA] hover:text-white hover:bg-white/[0.04]'
        }`;

        if (tab.href) {
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              className={tabStyles}
            >
              {content}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#8B5CF6] rounded-full" />
              )}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(tab.id)}
            className={tabStyles}
          >
            {content}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#8B5CF6] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
