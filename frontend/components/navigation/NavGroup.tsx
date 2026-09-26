'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NavItem, NavItemConfig } from './NavItem';
import { NavTooltip } from './NavTooltip';

interface NavGroupProps {
  label: string;
  items: NavItemConfig[];
  isCollapsed: boolean;
  defaultExpanded?: boolean;
  onItemClick?: () => void;
}

export function NavGroup({
  label,
  items,
  isCollapsed,
  defaultExpanded = true,
  onItemClick,
}: NavGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (isCollapsed) {
    return (
      <div className="space-y-1.5 py-1">
        {items.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            isCollapsed={isCollapsed}
            onClick={onItemClick}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-1 text-[11px] uppercase tracking-wider font-semibold text-[#8B8B96] hover:text-[#A1A1AA] transition-colors group"
      >
        <span>{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          } group-hover:text-white`}
        />
      </button>

      {isExpanded && (
        <div className="space-y-0.5 pt-0.5">
          {items.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
