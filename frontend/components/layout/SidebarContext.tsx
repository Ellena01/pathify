'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextValue {
  isSidebarOpen: boolean; // Mobile drawer open/close
  isSidebarCollapsed: boolean; // Desktop collapsed/expanded
  toggleSidebar: () => void;
  toggleCollapse: () => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Restore collapsed preference from localStorage on desktop
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pathify_sidebar_collapsed');
      if (stored !== null) {
        setIsSidebarCollapsed(stored === 'true');
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const closeSidebar = () => setIsSidebarOpen(false);
  const openSidebar = () => setIsSidebarOpen(true);

  const toggleCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pathify_sidebar_collapsed', String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  const setCollapsed = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    try {
      localStorage.setItem('pathify_sidebar_collapsed', String(collapsed));
    } catch {
      // Ignore
    }
  };

  return (
    <SidebarContext.Provider
      value={{
        isSidebarOpen,
        isSidebarCollapsed,
        toggleSidebar,
        toggleCollapse,
        closeSidebar,
        openSidebar,
        setCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
