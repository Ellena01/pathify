'use client';

import React from 'react';
import { useSidebar } from './SidebarContext';

interface MainCanvasProps {
  children: React.ReactNode;
  className?: string;
}

export function MainCanvas({ children, className = '' }: MainCanvasProps) {
  const { isSidebarCollapsed } = useSidebar();

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out pb-20 lg:pb-0 ${
        isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
      } ${className}`}
    >
      {children}
    </div>
  );
}
