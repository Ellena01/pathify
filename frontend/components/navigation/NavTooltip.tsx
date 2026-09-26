'use client';

import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'right' | 'top' | 'bottom';
  enabled?: boolean;
}

export function NavTooltip({ content, children, side = 'right', enabled = true }: TooltipProps) {
  if (!enabled) return <>{children}</>;

  return (
    <div className="relative group/tooltip flex items-center justify-center">
      {children}
      <div
        role="tooltip"
        className={`absolute pointer-events-none z-50 whitespace-nowrap px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#18132B] text-white border border-[#8B5CF6]/30 shadow-[0_4px_20px_rgba(0,0,0,0.6)] opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 transition-all duration-200 ease-out transform scale-95 group-hover/tooltip:scale-100 group-focus-within/tooltip:scale-100 ${
          side === 'right'
            ? 'left-full ml-3 top-1/2 -translate-y-1/2'
            : side === 'top'
            ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
            : 'top-full mt-2 left-1/2 -translate-x-1/2'
        }`}
      >
        {content}
        {/* Subtle arrow pointer */}
        <div
          className={`absolute w-1.5 h-1.5 bg-[#18132B] border-[#8B5CF6]/30 rotate-45 ${
            side === 'right'
              ? '-left-[4px] top-1/2 -translate-y-1/2 border-l border-b'
              : side === 'top'
              ? '-bottom-[4px] left-1/2 -translate-x-1/2 border-r border-b'
              : '-top-[4px] left-1/2 -translate-x-1/2 border-l border-t'
          }`}
        />
      </div>
    </div>
  );
}
