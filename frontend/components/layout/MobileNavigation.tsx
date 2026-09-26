'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ALL_NAV_ITEMS, isNavItemActive } from '@/lib/navigation';

/**
 * Mobile bottom navigation, rendered from the shared nav config.
 * It previously declared its own hardcoded list, which drifted from the
 * sidebar's list.
 */
export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-[#080414]/95 backdrop-blur-xl border-t border-white/[0.08] px-1 flex items-center justify-around"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {ALL_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = isNavItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 gap-1 transition-all ${
              isActive ? 'text-[#A78BFA]' : 'text-[#8B8B96] hover:text-[#A1A1AA]'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium leading-none tracking-tight">
              {item.shortLabel ?? item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
