'use client';

import React from 'react';
import { useSidebar } from './SidebarContext';
import {
  SIDEBAR_MARGIN_COLLAPSED,
  SIDEBAR_MARGIN_EXPANDED,
} from '@/lib/navigation';

interface MainCanvasProps {
  children: React.ReactNode;
  className?: string;
}

export function MainCanvas({ children, className = '' }: MainCanvasProps) {
  const { isSidebarCollapsed } = useSidebar();

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out pb-20 lg:pb-0 ${
        // Offset must equal the sidebar's rendered width (see lib/navigation.ts).
        isSidebarCollapsed ? SIDEBAR_MARGIN_COLLAPSED : SIDEBAR_MARGIN_EXPANDED
      } ${className}`}
    >
      {children}
    </div>
  );
}
