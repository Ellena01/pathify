'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Layers,
  Sparkles,
  Shield,
  Settings,
} from 'lucide-react';

export function MobileNavigation() {
  const pathname = usePathname();

  const NAV_ITEMS = [
    { href: '/dashboard', label: 'Dashboard', icon: Layers },
    { href: '/opportunities', label: 'Discover', icon: Compass },
    { href: '/navigator', label: 'Navigator', icon: Sparkles },
    { href: '/passport', label: 'Passport', icon: Shield },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-[#080414]/95 backdrop-blur-xl border-t border-white/[0.08] px-2 flex items-center justify-around"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 gap-1 transition-all ${
              isActive ? 'text-[#A78BFA]' : 'text-[#8B8B96] hover:text-[#A1A1AA]'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium leading-none tracking-tight">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
