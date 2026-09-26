'use client';

import React from 'react';

/**
 * Page-level header for the unified app shell.
 *
 * Previously each page passed `title`/`subtitle` into `<AppShell>`, which
 * meant the shell had to be imported and configured per page. With the shell in
 * the route-group layout, pages own their own header instead.
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned actions: buttons, filters, status pills. */
  actions?: React.ReactNode;
  eyebrow?: string;
  /** Page body, rendered below the header. */
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  children,
}: PageHeaderProps) {
  return (
    <>
      <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[#8B5CF6] mb-1.5">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F7]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-[#8B8B96] max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </>
  );
}

export default PageHeader;
