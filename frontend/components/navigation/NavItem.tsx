'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavTooltip } from '../navigation/NavTooltip';

export interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavItemProps {
  item: NavItemConfig;
  isCollapsed: boolean;
  onClick?: () => void;
}

export function NavItem({ item, isCollapsed, onClick }: NavItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive =
    pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

  const content = (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] ${
        isCollapsed
          ? 'w-11 h-11 justify-center mx-auto'
          : 'px-3.5 py-2.5 justify-between w-full'
      } ${
        isActive
          ? 'bg-[#8B5CF6]/15 text-white border border-[#8B5CF6]/30 shadow-[0_0_12px_rgba(139,92,246,0.18)]'
          : 'text-[#A1A1AA] hover:text-white hover:bg-white/[0.04]'
      }`}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors ${
            isActive ? 'text-[#A78BFA]' : 'text-[#8B8B96]'
          }`}
        />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </div>

      {!isCollapsed && item.badge && (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25 shrink-0">
          {item.badge}
        </span>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <NavTooltip content={item.label} side="right" enabled={isCollapsed}>
        {content}
      </NavTooltip>
    );
  }

  return content;
}
